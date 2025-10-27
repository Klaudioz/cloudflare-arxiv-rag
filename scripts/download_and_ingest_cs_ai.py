#!/usr/bin/env python3
"""
download_and_ingest_cs_ai.py

Downloads all 6000 CS.AI papers from arXiv S3, extracts text, and generates 
JSONL manifest for RAG ingestion.

Features:
- Parallel S3 downloads (8 concurrent) with retry logic
- PDF text extraction using pdfplumber
- Resumable downloads (skips existing files)
- Progress tracking with ETA
- Fallback to arXiv abstract if PDF extraction fails
- Batch JSONL output for ingestion

Usage:
  python scripts/download_and_ingest_cs_ai.py --storage-path ./storage [--max-papers 100]

Requirements:
  - AWS CLI configured for requester-pays access
  - pip install requests pdfplumber tqdm

Output:
  storage/
    ├── cs-ai-pdfs/        # Downloaded PDFs
    ├── cs-ai-papers.jsonl # Papers ready for ingestion
    └── download_log.txt   # Download progress log
"""

import argparse
import subprocess
import json
import sys
import os
import re
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from urllib.parse import quote
import xml.etree.ElementTree as ET

try:
    import requests
except ImportError:
    print("ERROR: requests library not found. Install with: pip install requests")
    sys.exit(1)

try:
    import pdfplumber
except ImportError:
    print("WARNING: pdfplumber not found. PDF text extraction will be skipped.")
    print("Install with: pip install pdfplumber")
    pdfplumber = None

try:
    from tqdm import tqdm
except ImportError:
    print("WARNING: tqdm not found. Progress bars disabled. Install with: pip install tqdm")
    tqdm = None


# ========================
# Helpers
# ========================

def run_cmd(cmd, check=True):
    """Run shell command and return result."""
    p = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"Command failed: {cmd}\nSTDERR: {p.stderr}")
    return p


def human_bytes(n):
    """Convert bytes to human readable format."""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if n < 1024.0:
            return f"{n:3.2f} {unit}"
        n /= 1024.0
    return f"{n:.2f} PB"


def aws_s3_cp(s3_path, dest_path, requester_pays=True):
    """Download from S3 using AWS CLI."""
    req = "--request-payer requester" if requester_pays else ""
    cmd = f'aws s3 cp "{s3_path}" "{dest_path}" {req} 2>/dev/null'
    try:
        result = run_cmd(cmd, check=True)
        return True
    except RuntimeError:
        return False


def extract_text_from_pdf(pdf_path, max_length=5000):
    """Extract text from PDF using pdfplumber."""
    if pdfplumber is None:
        return None
    
    try:
        text_parts = []
        with pdfplumber.open(pdf_path) as pdf:
            # Extract from first 3 pages (usually abstract + intro)
            for page_idx, page in enumerate(pdf.pages[:3]):
                text = page.extract_text()
                if text:
                    text_parts.append(text)
        
        full_text = "\n".join(text_parts)
        # Clean up and limit length
        full_text = " ".join(full_text.split())[:max_length]
        return full_text if full_text.strip() else None
    except Exception as e:
        return None


def fetch_paper_metadata_from_arxiv(arxiv_id):
    """Fetch paper metadata from arXiv API."""
    try:
        url = f"http://export.arxiv.org/api/query?id_list={arxiv_id}"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        root = ET.fromstring(response.content)
        entry = root.find('.//{http://www.w3.org/2005/Atom}entry')
        
        if entry is None:
            return None
        
        # Extract fields
        title_elem = entry.find('{http://www.w3.org/2005/Atom}title')
        summary_elem = entry.find('{http://www.w3.org/2005/Atom}summary')
        published_elem = entry.find('{http://www.w3.org/2005/Atom}published')
        
        title = (title_elem.text or "").replace("\n", " ").strip() if title_elem is not None else "Unknown"
        abstract = (summary_elem.text or "").replace("\n", " ").strip() if summary_elem is not None else ""
        published = (published_elem.text or "").split("T")[0] if published_elem is not None else ""
        
        # Extract authors
        authors = []
        for author in entry.findall('{http://www.w3.org/2005/Atom}author'):
            name_elem = author.find('{http://www.w3.org/2005/Atom}name')
            if name_elem is not None:
                authors.append(name_elem.text)
        
        return {
            "title": title,
            "abstract": abstract,
            "authors": authors if authors else ["Unknown"],
            "published": published
        }
    except Exception as e:
        return None


def download_paper(arxiv_id, pdf_dir, max_retries=3):
    """Download a single paper and extract metadata."""
    pdf_path = pdf_dir / f"{arxiv_id}.pdf"
    
    # Skip if already exists
    if pdf_path.exists():
        return {"status": "skipped", "arxiv_id": arxiv_id}
    
    # Try to download from arXiv S3
    s3_path = f"s3://arxiv/pdf/{arxiv_id[:4]}/{arxiv_id[4:8]}/{arxiv_id}.pdf"
    
    for attempt in range(max_retries):
        if aws_s3_cp(s3_path, str(pdf_path), requester_pays=True):
            break
    else:
        return {"status": "failed", "arxiv_id": arxiv_id, "error": "S3 download failed"}
    
    # Extract text from PDF
    text = extract_text_from_pdf(str(pdf_path))
    
    # Fetch metadata from arXiv API
    metadata = fetch_paper_metadata_from_arxiv(arxiv_id)
    if not metadata:
        return {"status": "failed", "arxiv_id": arxiv_id, "error": "Metadata fetch failed"}
    
    return {
        "status": "success",
        "arxiv_id": arxiv_id,
        "title": metadata["title"],
        "abstract": metadata["abstract"],
        "authors": metadata["authors"],
        "published": metadata["published"],
        "extracted_text": text,
        "pdf_url": f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    }


# ========================
# Main Workflow
# ========================

def main(storage_path: Path, max_papers=None):
    """Main download and ingestion workflow."""
    storage_path = storage_path.resolve()
    storage_path.mkdir(parents=True, exist_ok=True)
    
    pdf_dir = storage_path / "cs-ai-pdfs"
    pdf_dir.mkdir(exist_ok=True)
    
    output_jsonl = storage_path / "cs-ai-papers.jsonl"
    log_file = storage_path / "download_log.txt"
    
    print(f"\n{'='*70}")
    print("CS.AI Paper Bulk Download & Ingestion")
    print(f"{'='*70}")
    print(f"Storage path: {storage_path}")
    print(f"PDF directory: {pdf_dir}")
    print(f"Output JSONL: {output_jsonl}")
    
    # Step 1: Load paper IDs
    print("\n[Step 1] Loading CS.AI paper IDs...")
    
    # Check if we have cs_ai_ids.txt from previous run
    cs_ai_ids_file = storage_path / "cs_ai_ids.txt"
    if not cs_ai_ids_file.exists():
        print("  Fetching CS.AI papers from arXiv API...")
        base_url = "http://export.arxiv.org/api/query"
        paper_ids = []
        start = 0
        batch_size = 2000
        
        while True:
            params = {
                'search_query': 'cat:cs.AI',
                'start': start,
                'max_results': batch_size,
                'sortBy': 'submittedDate',
                'sortOrder': 'ascending'
            }
            
            try:
                response = requests.get(base_url, params=params, timeout=30)
                response.raise_for_status()
            except requests.RequestException as e:
                print(f"  ERROR fetching from API: {e}")
                break
            
            root = ET.fromstring(response.content)
            found_count = 0
            
            for entry in root.findall('.//{http://www.w3.org/2005/Atom}entry'):
                id_elem = entry.find('{http://www.w3.org/2005/Atom}id')
                if id_elem is not None:
                    arxiv_id = id_elem.text.split('/abs/')[-1]
                    arxiv_id_base = re.sub(r'v\d+$', '', arxiv_id)
                    paper_ids.append(arxiv_id_base)
                    found_count += 1
                    
                    if max_papers and len(paper_ids) >= max_papers:
                        break
            
            if found_count == 0 or (max_papers and len(paper_ids) >= max_papers):
                break
            
            start += batch_size
            time.sleep(2)  # Rate limiting
        
        # Save IDs for resume capability
        with open(cs_ai_ids_file, "w") as f:
            for pid in paper_ids:
                f.write(pid + "\n")
    else:
        # Load from existing file
        with open(cs_ai_ids_file, "r") as f:
            paper_ids = [line.strip() for line in f if line.strip()]
    
    if max_papers:
        paper_ids = paper_ids[:max_papers]
    
    print(f"  Found {len(paper_ids)} papers to download")
    
    # Step 2: Parallel download
    print(f"\n[Step 2] Downloading {len(paper_ids)} PDFs (parallel)...")
    results = {"success": 0, "failed": 0, "skipped": 0}
    all_papers = []
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(download_paper, pid, pdf_dir): pid for pid in paper_ids}
        
        # Progress bar
        if tqdm:
            progress_iterator = tqdm(as_completed(futures), total=len(futures), desc="Downloading")
        else:
            progress_iterator = as_completed(futures)
        
        for future in progress_iterator:
            result = future.result()
            status = result.get("status")
            results[status] += 1
            
            if status == "success":
                all_papers.append(result)
            
            # Log to file
            with open(log_file, "a") as f:
                f.write(json.dumps(result) + "\n")
    
    print(f"\n  ✓ Success: {results['success']}")
    print(f"  ✗ Failed: {results['failed']}")
    print(f"  ⊘ Skipped: {results['skipped']}")
    
    # Step 3: Write JSONL
    print(f"\n[Step 3] Writing JSONL manifest...")
    with open(output_jsonl, "w") as f:
        for paper in all_papers:
            # Convert to ingestion format
            ingestion_doc = {
                "id": paper["arxiv_id"],
                "title": paper["title"],
                "abstract": paper["abstract"],
                "authors": paper["authors"],
                "published": paper["published"],
                "category": "cs.AI",
                "arxiv_id": paper["arxiv_id"],
                "pdf_url": paper["pdf_url"],
                "full_text": paper["extracted_text"] or paper["abstract"]
            }
            f.write(json.dumps(ingestion_doc) + "\n")
    
    print(f"  ✓ Wrote {len(all_papers)} papers to {output_jsonl}")
    
    # Step 4: Summary
    print(f"\n[Step 4] Summary")
    print(f"{'='*70}")
    total_size = sum(f.stat().st_size for f in pdf_dir.glob("*.pdf"))
    print(f"  Papers downloaded: {results['success']}")
    print(f"  Total PDF size: {human_bytes(total_size)}")
    print(f"  JSONL file: {output_jsonl}")
    print(f"  Next step: Deploy and trigger bulk ingestion via Workers")
    print(f"{'='*70}\n")


# ========================
# CLI
# ========================

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Download CS.AI papers and generate JSONL for RAG ingestion"
    )
    parser.add_argument("--storage-path", required=True, help="Storage directory path")
    parser.add_argument("--max-papers", type=int, default=None, help="Max papers to download (for testing)")
    
    args = parser.parse_args()
    
    try:
        main(Path(args.storage_path), max_papers=args.max_papers)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user. Download can be resumed.")
        sys.exit(0)
    except Exception as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)
