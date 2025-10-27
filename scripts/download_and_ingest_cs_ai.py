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


def is_valid_pdf(file_path, min_size=5000):
    """Check if PDF is valid (not empty/corrupted)."""
    try:
        size = os.path.getsize(file_path)
        if size < min_size:
            return False
        # Check PDF magic bytes
        with open(file_path, 'rb') as f:
            header = f.read(4)
            return header == b'%PDF'
    except:
        return False


def download_pdf_direct(arxiv_id, dest_path, attempt=1, max_attempts=5):
    """Download PDF directly from arXiv using HTTP with exponential backoff."""
    # Construct URL (works for both old and new formats)
    url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
    
    try:
        # allow_redirects=True follows 301/302 redirects automatically
        response = requests.get(url, timeout=30, stream=True, allow_redirects=True)
        if response.status_code == 200:
            with open(dest_path, 'wb') as f:
                f.write(response.content)
            
            # Validate PDF
            if is_valid_pdf(dest_path):
                return True
            else:
                # PDF is corrupt/empty, delete it and retry
                os.remove(dest_path)
                if attempt < max_attempts:
                    wait_time = 2 ** (attempt - 1)
                    time.sleep(wait_time)
                    return download_pdf_direct(arxiv_id, dest_path, attempt + 1, max_attempts)
                else:
                    print(f"    [INVALID] {arxiv_id}: Not a valid PDF (possibly error page)")
                    return False
        elif response.status_code in [500, 502, 503, 504]:
            # Server errors - retry with backoff
            if attempt < max_attempts:
                wait_time = 2 ** (attempt - 1)  # 1s, 2s, 4s, 8s
                time.sleep(wait_time)
                return download_pdf_direct(arxiv_id, dest_path, attempt + 1, max_attempts)
            else:
                print(f"    [FAIL] {arxiv_id}: HTTP {response.status_code} after {max_attempts} attempts")
        elif response.status_code == 404:
            # Not found - don't retry
            print(f"    [404] {arxiv_id}: Paper not found")
        else:
            print(f"    [WARN] {arxiv_id}: HTTP {response.status_code}")
    except requests.Timeout:
        if attempt < max_attempts:
            wait_time = 2 ** (attempt - 1)
            time.sleep(wait_time)
            return download_pdf_direct(arxiv_id, dest_path, attempt + 1, max_attempts)
        else:
            print(f"    [TIMEOUT] {arxiv_id}: After {max_attempts} attempts")
    except Exception as e:
        if attempt < max_attempts and not isinstance(e, (FileNotFoundError, PermissionError)):
            wait_time = 2 ** (attempt - 1)
            time.sleep(wait_time)
            return download_pdf_direct(arxiv_id, dest_path, attempt + 1, max_attempts)
        else:
            print(f"    [ERROR] {arxiv_id}: {type(e).__name__}: {str(e)[:80]}")
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
    # Normalize filename (replace / and . with -)
    # cs/9308101 -> cs-9308101.pdf
    # 1706.03762 -> 1706-03762.pdf
    safe_filename = arxiv_id.replace('/', '-').replace('.', '-')
    pdf_path = pdf_dir / f"{safe_filename}.pdf"
    
    # Skip if already exists
    if pdf_path.exists():
        return {"status": "skipped", "arxiv_id": arxiv_id}
    
    # Download from arXiv using HTTP (with exponential backoff)
    if not download_pdf_direct(arxiv_id, str(pdf_path), attempt=1, max_attempts=5):
        return {"status": "failed", "arxiv_id": arxiv_id, "error": "PDF download failed"}
    
    # Extract text from PDF
    text = extract_text_from_pdf(str(pdf_path))
    
    # Fetch metadata from arXiv API (with fallback)
    metadata = fetch_paper_metadata_from_arxiv(arxiv_id)
    if not metadata:
        # Fallback: create minimal metadata from arxiv_id
        # Better to have paper with minimal metadata than to skip it
        metadata = {
            "title": f"arXiv paper {arxiv_id}",
            "abstract": text[:500] if text else f"Paper {arxiv_id}",
            "authors": ["Unknown"],
            "published": "2025-01-01"
        }
    
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
    
    # Determine max papers to fetch (default: ALL available)
    # Query arXiv to get total count if not specified
    if max_papers:
        effective_max = max_papers
    else:
        try:
            base_url = "http://export.arxiv.org/api/query"
            params = {
                'search_query': 'cat:cs.AI',
                'start': 0,
                'max_results': 1,
            }
            response = requests.get(base_url, params=params, timeout=30)
            root = ET.fromstring(response.content)
            total_elem = root.find('.//{http://a9.com/-/spec/opensearch/1.1/}totalResults')
            if total_elem is not None:
                effective_max = int(total_elem.text)
                print(f"  Total CS.AI papers available: {effective_max:,}")
            else:
                effective_max = 6000
        except Exception as e:
            print(f"  Warning: Could not get total count, defaulting to 6000: {e}")
            effective_max = 6000
    
    # Check if we have cs_ai_ids.txt from previous run
    cs_ai_ids_file = storage_path / "cs_ai_ids.txt"
    ids_checkpoint_file = storage_path / "ids_checkpoint.txt"  # Track last successful batch
    
    if not cs_ai_ids_file.exists():
        print(f"  Fetching CS.AI papers from arXiv API ({effective_max:,} total)...")
        base_url = "http://export.arxiv.org/api/query"
        paper_ids = []
        start = 0
        batch_size = 2000
        last_checkpoint = 0
        
        # Check for checkpoint
        if ids_checkpoint_file.exists():
            try:
                with open(ids_checkpoint_file) as f:
                    last_checkpoint = int(f.read().strip())
                    start = last_checkpoint
                    print(f"  Resuming from batch starting at {start}...")
            except:
                pass
        
        # Load any previously fetched IDs
        if cs_ai_ids_file.exists():
            with open(cs_ai_ids_file) as f:
                paper_ids = [line.strip() for line in f if line.strip()]
        
        while len(paper_ids) < effective_max:
            batch_num = (start // batch_size) + 1
            print(f"  Fetching batch {batch_num} (papers {start}-{start + batch_size})...")
            
            params = {
                'search_query': 'cat:cs.AI',
                'start': start,
                'max_results': min(batch_size, effective_max - len(paper_ids)),
                'sortBy': 'submittedDate',
                'sortOrder': 'ascending'
            }
            
            try:
                response = requests.get(base_url, params=params, timeout=60)
                response.raise_for_status()
            except requests.RequestException as e:
                print(f"  ERROR fetching from API: {e}")
                print(f"  Checkpoint: {start} papers")
                break
            
            try:
                root = ET.fromstring(response.content)
            except ET.ParseError as e:
                print(f"  ERROR parsing XML: {e}")
                print(f"  Checkpoint: {start} papers")
                break
            
            found_count = 0
            
            for entry in root.findall('.//{http://www.w3.org/2005/Atom}entry'):
                if len(paper_ids) >= effective_max:
                    break
                id_elem = entry.find('{http://www.w3.org/2005/Atom}id')
                if id_elem is not None:
                    arxiv_id = id_elem.text.split('/abs/')[-1]
                    arxiv_id_base = re.sub(r'v\d+$', '', arxiv_id)
                    paper_ids.append(arxiv_id_base)
                    found_count += 1
            
            if found_count == 0:
                print(f"  No more papers found. Total: {len(paper_ids):,}")
                break
            
            # Save checkpoint and IDs after each batch
            with open(ids_checkpoint_file, "w") as f:
                f.write(str(start + batch_size))
            with open(cs_ai_ids_file, "w") as f:
                for pid in paper_ids:
                    f.write(pid + "\n")
            
            print(f"  Fetched {len(paper_ids):,} papers so far")
            start += batch_size
            time.sleep(2)  # Rate limiting
        
        # Remove checkpoint after successful completion
        try:
            os.remove(ids_checkpoint_file)
        except:
            pass
    else:
        # Load from existing file
        with open(cs_ai_ids_file, "r") as f:
            all_ids = [line.strip() for line in f if line.strip()]
        paper_ids = all_ids if not max_papers else all_ids[:max_papers]
        print(f"  Loaded {len(paper_ids):,} papers from cache")
    
    print(f"  Total papers to download: {len(paper_ids):,}")
    
    # Step 2: Parallel download
    print(f"\n[Step 2] Downloading {len(paper_ids):,} PDFs (parallel)...")
    results = {"success": 0, "failed": 0, "skipped": 0}
    all_papers = []
    failed_ids = []
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(download_paper, pid, pdf_dir): pid for pid in paper_ids}
        
        # Progress bar
        if tqdm:
            progress_iterator = tqdm(as_completed(futures), total=len(futures), desc="Downloading")
        else:
            progress_iterator = as_completed(futures)
        
        for future in progress_iterator:
            try:
                result = future.result()
                status = result.get("status")
                results[status] += 1
                
                if status == "success":
                    all_papers.append(result)
                elif status == "failed":
                    failed_ids.append(result.get("arxiv_id"))
                
                # Log to file
                with open(log_file, "a") as f:
                    f.write(json.dumps(result) + "\n")
            except Exception as e:
                print(f"  [ERROR] Future execution error: {e}")
                results["failed"] += 1
    
    print(f"\n  ✓ Success: {results['success']:,}")
    print(f"  ✗ Failed: {results['failed']:,}")
    print(f"  ⊘ Skipped: {results['skipped']:,}")
    
    # Save failed IDs for reference
    if failed_ids:
        failed_file = storage_path / "failed_ids.txt"
        with open(failed_file, "w") as f:
            for fid in failed_ids:
                f.write(fid + "\n")
        print(f"  Failed IDs saved to: {failed_file}")
    
    # Step 3: Write JSONL - regenerate for ALL downloaded PDFs
    print(f"\n[Step 3] Writing JSONL manifest for all downloaded PDFs...")
    
    # Get all downloaded PDF files and validate
    all_pdfs = list(pdf_dir.glob("*.pdf"))
    pdf_files = [pdf for pdf in all_pdfs if is_valid_pdf(pdf)]
    invalid_pdfs = len(all_pdfs) - len(pdf_files)
    
    print(f"  Found {len(all_pdfs)} PDF files, {len(pdf_files)} valid, {invalid_pdfs} corrupt/empty")
    
    # Remove invalid PDFs
    if invalid_pdfs > 0:
        print(f"  Removing {invalid_pdfs} invalid PDFs...")
        for pdf in all_pdfs:
            if not is_valid_pdf(pdf):
                try:
                    os.remove(pdf)
                except:
                    pass
    
    ingested_count = 0
    with open(output_jsonl, "w") as f:
        for pdf_file in pdf_files:
            # Reconstruct arxiv_id from filename (reverse normalization)
            # cs-9308101.pdf -> cs/9308101
            # 1706-03762.pdf -> 1706.03762
            filename = pdf_file.stem
            
            # Check if it's old format (contains letters) or new format (all digits/dashes)
            if any(c.isalpha() for c in filename):
                # Old format: cs-9308101 -> cs/9308101
                arxiv_id = filename.replace('-', '/')
            else:
                # New format: 1706-03762 -> 1706.03762
                arxiv_id = filename.replace('-', '.', 1)  # Replace first dash only
            
            # Try to get metadata from log first
            paper_metadata = None
            for paper in all_papers:
                if paper["arxiv_id"] == arxiv_id:
                    paper_metadata = paper
                    break
            
            # If not in log, create minimal metadata
            if not paper_metadata:
                text = extract_text_from_pdf(str(pdf_file))
                paper_metadata = {
                    "arxiv_id": arxiv_id,
                    "title": f"arXiv {arxiv_id}",
                    "abstract": text[:500] if text else f"Paper {arxiv_id}",
                    "authors": ["Unknown"],
                    "published": "2024-01-01",
                    "extracted_text": text,
                    "pdf_url": f"https://arxiv.org/pdf/{arxiv_id}.pdf"
                }
            
            # Write to JSONL
            ingestion_doc = {
                "id": arxiv_id,
                "title": paper_metadata.get("title", f"arXiv {arxiv_id}"),
                "abstract": paper_metadata.get("abstract", ""),
                "authors": paper_metadata.get("authors", ["Unknown"]),
                "published": paper_metadata.get("published", "2024-01-01"),
                "category": "cs.AI",
                "arxiv_id": arxiv_id,
                "pdf_url": paper_metadata.get("pdf_url", f"https://arxiv.org/pdf/{arxiv_id}.pdf"),
                "full_text": paper_metadata.get("extracted_text") or paper_metadata.get("abstract", "")
            }
            f.write(json.dumps(ingestion_doc) + "\n")
            ingested_count += 1
    
    print(f"  ✓ Wrote {ingested_count} papers to {output_jsonl}")
    
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
