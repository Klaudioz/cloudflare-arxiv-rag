#!/usr/bin/env python3
"""
download_and_ingest_cs_ai_v2.py

Production-ready arXiv paper downloader with:
- Per-paper category tracking (not hardcoded)
- Stream-write metadata (no memory bloat)
- Proper arXiv ID parsing with version handling
- Dynamic date filtering (current year/month aware)
- Deduplication across categories
- Robust PDF validation

Usage:
  python scripts/download_and_ingest_cs_ai_v2.py --storage-path ./storage

Requirements:
  pip install requests pdfplumber tqdm

Output:
  storage/
    ├── cs-ai-pdfs/           # Downloaded PDFs
    ├── cs-ai-papers.jsonl    # Ready for AI Search ingestion
    ├── download.log          # Detailed logs
    └── metadata.jsonl        # Per-paper metadata (intermediate)
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
import xml.etree.ElementTree as ET

try:
    import requests
except ImportError:
    print("ERROR: requests not found. pip install requests", file=sys.stderr)
    sys.exit(1)

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    from tqdm import tqdm
except ImportError:
    tqdm = None

try:
    import arxiv
except ImportError:
    print("ERROR: arxiv not found. pip install arxiv", file=sys.stderr)
    sys.exit(1)


class ArxivDownloader:
    """Production-grade arXiv downloader with proper metadata tracking."""
    
    def __init__(self, storage_path, log_file=None):
        self.storage_path = Path(storage_path).resolve()
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        self.pdf_dir = self.storage_path / "cs-ai-pdfs"
        self.pdf_dir.mkdir(exist_ok=True)
        
        self.metadata_file = self.storage_path / "metadata.jsonl"
        self.output_jsonl = self.storage_path / "cs-ai-papers.jsonl"
        self.ids_file = self.storage_path / "cs_ai_ids.txt"
        self.failed_file = self.storage_path / "failed_ids.txt"
        
        # Setup logging
        log_path = log_file or (self.storage_path / "download.log")
        self.logger = self._setup_logger(log_path)
        
        # Thread safety
        self.metadata_lock = Lock()
        self.id_lock = Lock()
        
        # Stats
        self.stats = {"success": 0, "failed": 0, "skipped": 0}
        
    def _setup_logger(self, log_path):
        logger = logging.getLogger("arxiv_downloader")
        logger.setLevel(logging.INFO)
        
        # File handler
        fh = logging.FileHandler(log_path)
        fh.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
        logger.addHandler(fh)
        
        # Console handler
        ch = logging.StreamHandler(sys.stdout)
        ch.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
        logger.addHandler(ch)
        
        return logger
    
    def _normalize_arxiv_id(self, arxiv_id: str) -> str:
        """Normalize arxiv ID: remove versions, handle old/new format."""
        # Remove version suffix (v1, v2, etc.)
        normalized = re.sub(r'v\d+$', '', arxiv_id).strip()
        return normalized
    
    def _is_valid_pdf(self, file_path: Path, min_size: int = 5000) -> bool:
        """Validate PDF is real (not error page, corrupted)."""
        try:
            size = file_path.stat().st_size
            if size < min_size:
                return False
            
            with file_path.open('rb') as f:
                header = f.read(4)
            
            # Must start with %PDF
            return header == b'%PDF'
        except Exception as e:
            self.logger.debug(f"PDF validation error for {file_path}: {e}")
            return False
    
    def _extract_text(self, pdf_path: Path, max_chars: int = 5000) -> str:
        """Extract text from first 3 pages of PDF."""
        if pdfplumber is None:
            return ""
        
        try:
            parts = []
            with pdfplumber.open(str(pdf_path)) as pdf:
                for page in pdf.pages[:3]:
                    text = page.extract_text()
                    if text:
                        parts.append(text)
            
            full = " ".join(parts)
            full = " ".join(full.split())[:max_chars]
            return full if full.strip() else ""
        except Exception as e:
            self.logger.debug(f"Text extraction error for {pdf_path}: {e}")
            return ""
    
    def _fetch_metadata(self, arxiv_id: str) -> dict:
        """Fetch paper metadata from arXiv API."""
        try:
            url = f"https://export.arxiv.org/api/query?id_list={arxiv_id}"
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            
            root = ET.fromstring(resp.content)
            entry = root.find('.//{http://www.w3.org/2005/Atom}entry')
            if entry is None:
                return None
            
            title_el = entry.find('{http://www.w3.org/2005/Atom}title')
            summary_el = entry.find('{http://www.w3.org/2005/Atom}summary')
            published_el = entry.find('{http://www.w3.org/2005/Atom}published')
            
            title = (title_el.text or "").replace("\n", " ").strip() if title_el is not None else "Unknown"
            abstract = (summary_el.text or "").replace("\n", " ").strip() if summary_el is not None else ""
            published = (published_el.text or "").split("T")[0] if published_el is not None else ""
            
            authors = []
            for author_el in entry.findall('{http://www.w3.org/2005/Atom}author'):
                name_el = author_el.find('{http://www.w3.org/2005/Atom}name')
                if name_el is not None and name_el.text:
                    authors.append(name_el.text)
            
            categories = []
            for cat_el in entry.findall('{http://www.w3.org/2005/Atom}category'):
                term = cat_el.attrib.get('term')
                if term:
                    categories.append(term)
            
            return {
                "title": title,
                "abstract": abstract,
                "authors": authors or ["Unknown"],
                "published": published,
                "categories": categories
            }
        except Exception as e:
            self.logger.debug(f"Metadata fetch failed for {arxiv_id}: {e}")
            return None
    
    def _download_pdf(self, arxiv_id: str, dest_path: Path, attempt: int = 1, max_attempts: int = 5) -> bool:
        """Download PDF with retry logic."""
        url = f"https://arxiv.org/pdf/{arxiv_id}.pdf"
        headers = {'User-Agent': 'Mozilla/5.0 (compatible; ArxivDownloader/1.0)'}
        
        try:
            resp = requests.get(url, timeout=60, stream=True, headers=headers, allow_redirects=True)
            
            if resp.status_code == 200:
                # Stream to temp file first
                tmp_path = dest_path.with_suffix(dest_path.suffix + ".part")
                try:
                    with tmp_path.open('wb') as f:
                        for chunk in resp.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                    
                    # Validate before moving
                    if self._is_valid_pdf(tmp_path):
                        os.replace(tmp_path, dest_path)
                        return True
                    else:
                        tmp_path.unlink(missing_ok=True)
                        if attempt < max_attempts:
                            time.sleep(min(2 ** attempt, 30))
                            return self._download_pdf(arxiv_id, dest_path, attempt + 1, max_attempts)
                        return False
                finally:
                    tmp_path.unlink(missing_ok=True)
            
            elif resp.status_code in (429, 500, 502, 503, 504):
                if attempt < max_attempts:
                    wait = min(2 ** attempt, 60)
                    time.sleep(wait)
                    return self._download_pdf(arxiv_id, dest_path, attempt + 1, max_attempts)
                return False
            
            elif resp.status_code == 404:
                return False
            
            else:
                if attempt < max_attempts:
                    time.sleep(min(2 ** attempt, 30))
                    return self._download_pdf(arxiv_id, dest_path, attempt + 1, max_attempts)
                return False
        
        except requests.Timeout:
            if attempt < max_attempts:
                time.sleep(min(2 ** attempt, 30))
                return self._download_pdf(arxiv_id, dest_path, attempt + 1, max_attempts)
            return False
        except Exception as e:
            self.logger.debug(f"Download error for {arxiv_id}: {e}")
            if attempt < max_attempts:
                time.sleep(min(2 ** attempt, 30))
                return self._download_pdf(arxiv_id, dest_path, attempt + 1, max_attempts)
            return False
    
    def _safe_filename(self, arxiv_id: str) -> str:
        """Convert arxiv ID to safe filename."""
        # Replace slashes with dash for old format
        return arxiv_id.replace('/', '-').replace('.', '-')
    
    def _download_worker(self, arxiv_id: str) -> dict:
        """Download single paper and extract metadata."""
        arxiv_id_norm = self._normalize_arxiv_id(arxiv_id)
        safe_name = self._safe_filename(arxiv_id_norm)
        pdf_path = self.pdf_dir / f"{safe_name}.pdf"
        
        # Skip if exists
        if pdf_path.exists() and self._is_valid_pdf(pdf_path):
            return {"status": "skipped", "arxiv_id": arxiv_id_norm}
        
        # Download PDF
        if not self._download_pdf(arxiv_id_norm, pdf_path):
            return {"status": "failed", "arxiv_id": arxiv_id_norm}
        
        # Extract text
        text = self._extract_text(pdf_path)
        
        # Fetch metadata from API
        metadata = self._fetch_metadata(arxiv_id_norm)
        if not metadata:
            metadata = {
                "title": f"arXiv {arxiv_id_norm}",
                "abstract": text[:500] if text else "",
                "authors": ["Unknown"],
                "published": "",
                "categories": []
            }
        
        record = {
            "status": "success",
            "arxiv_id": arxiv_id_norm,
            "title": metadata["title"],
            "abstract": metadata["abstract"],
            "authors": metadata["authors"],
            "published": metadata["published"],
            "categories": metadata["categories"],  # KEY: per-paper categories
            "extracted_text": text,
            "pdf_url": f"https://arxiv.org/pdf/{arxiv_id_norm}.pdf"
        }
        
        # STREAM WRITE: append metadata immediately (no memory bloat)
        with self.metadata_lock:
            with self.metadata_file.open('a') as f:
                f.write(json.dumps(record) + "\n")
        
        return record
    
    def fetch_paper_ids(self, categories: str, min_date: str) -> list:
        """Fetch all paper IDs from arXiv using arxiv.py library.
        
        Uses arxiv.py for automatic pagination, 3-second delays (arXiv ToU), 
        and proper error handling. Handles 452k+ papers efficiently.
        """
        cat_list = [c.strip() for c in categories.split(',')]
        self.logger.info(f"Fetching papers from: {', '.join(cat_list)}")
        self.logger.info(f"Minimum date: {min_date}")
        
        # Check cache
        if self.ids_file.exists():
            with self.ids_file.open('r') as f:
                ids = [line.strip() for line in f if line.strip()]
            self.logger.info(f"Loaded {len(ids)} IDs from cache")
            return ids
        
        # Create arxiv client with mandatory 3-second delay (arXiv ToU requirement)
        client = arxiv.Client(
            page_size=2000,        # Max per request (arXiv API limit)
            delay_seconds=3.0,     # MANDATORY 3-second delay per arXiv Terms of Use
            num_retries=3
        )
        
        # Parse dates for date range
        min_parts = min_date.split('-')
        min_ts = f"{min_parts[0]}{min_parts[1]}{min_parts[2]}0000"
        
        # Dynamic upper bound (current date)
        now = datetime.now(datetime.timezone.utc)
        max_ts = now.strftime('%Y%m%d2359')
        
        # Build query with categories and date range
        cat_query = " OR ".join([f"cat:{c}" for c in cat_list])
        full_query = f"({cat_query}) AND submittedDate:[{min_ts} TO {max_ts}]"
        
        self.logger.info(f"Query: {full_query}")
        self.logger.info(f"Using arxiv.py with 3-second delays (arXiv ToU compliant)")
        
        # Create search with unlimited results
        search = arxiv.Search(
            query=full_query,
            max_results=float('inf'),  # Fetch ALL available results
            sort_by=arxiv.SortCriterion.SubmittedDate
        )
        
        # Fetch using generator (handles pagination automatically)
        paper_ids = set()
        count = 0
        
        try:
            for result in client.results(search):
                arxiv_id = result.get_short_id()
                arxiv_id_norm = self._normalize_arxiv_id(arxiv_id)
                
                # Deduplicate across categories
                if arxiv_id_norm not in paper_ids:
                    paper_ids.add(arxiv_id_norm)
                    count += 1
                    
                    # Log progress every 1000 papers
                    if count % 1000 == 0:
                        self.logger.info(f"  Collected {count} unique papers so far")
            
            self.logger.info(f"Finished fetching. Total unique papers: {len(paper_ids)}")
        
        except arxiv.UnexpectedEmptyPageError:
            # Normal end of results - arxiv.py raises this when all results are exhausted
            self.logger.info(f"Finished fetching (end of results). Total unique papers: {len(paper_ids)}")
        except Exception as e:
            self.logger.error(f"API fetch failed: {e}")
            self.logger.error(f"Partial results: {len(paper_ids)} papers collected before error")
        
        # Save IDs
        ids_list = sorted(list(paper_ids))
        with self.ids_file.open('w') as f:
            for pid in ids_list:
                f.write(pid + "\n")
        
        return ids_list
    
    def download_papers(self, paper_ids: list, max_workers: int = 8, max_retries: int = 3):
        """Download all papers with retry logic."""
        self.logger.info(f"Downloading {len(paper_ids)} papers...")
        
        to_retry = paper_ids.copy()
        
        for retry_attempt in range(1, max_retries + 1):
            if not to_retry:
                break
            
            self.logger.info(f"Pass {retry_attempt}/{max_retries}: {len(to_retry)} papers")
            failed_this_pass = []
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {executor.submit(self._download_worker, pid): pid for pid in to_retry}
                
                iterator = tqdm(as_completed(futures), total=len(futures), desc=f"Download P{retry_attempt}") if tqdm else as_completed(futures)
                
                for future in iterator:
                    try:
                        result = future.result()
                        status = result["status"]
                        
                        if status == "success":
                            self.stats["success"] += 1
                        elif status == "failed":
                            failed_this_pass.append(result["arxiv_id"])
                        else:
                            self.stats["skipped"] += 1
                    except Exception as e:
                        self.logger.error(f"Worker error: {e}")
                        failed_this_pass.append(futures[future])
            
            to_retry = failed_this_pass
        
        # Final failures
        if to_retry:
            with self.failed_file.open('w') as f:
                for fid in to_retry:
                    f.write(fid + "\n")
            self.logger.info(f"Failed IDs saved to {self.failed_file}")
        
        self.logger.info(f"✓ Success: {self.stats['success']}")
        self.logger.info(f"✗ Failed: {len(to_retry)}")
        self.logger.info(f"⊘ Skipped: {self.stats['skipped']}")
    
    def generate_manifest(self):
        """Generate final JSONL from metadata (with real categories per paper)."""
        self.logger.info("Generating manifest...")
        
        # Load metadata
        records = {}
        if self.metadata_file.exists():
            with self.metadata_file.open('r') as f:
                for line in f:
                    try:
                        obj = json.loads(line)
                        aid = obj.get("arxiv_id")
                        if aid:
                            records[aid] = obj
                    except json.JSONDecodeError:
                        pass
        
        # Write output JSONL
        count = 0
        with self.output_jsonl.open('w') as out:
            for arxiv_id, record in records.items():
                if record["status"] != "success":
                    continue
                
                # Use actual category from metadata (first one, or default)
                category = record["categories"][0] if record.get("categories") else "cs.AI"
                
                ingestion_doc = {
                    "id": arxiv_id,
                    "arxiv_id": arxiv_id,
                    "title": record["title"],
                    "abstract": record["abstract"],
                    "authors": record["authors"],
                    "published": record["published"],
                    "category": category,  # REAL category, not hardcoded
                    "pdf_url": record["pdf_url"],
                    "full_text": record["extracted_text"] or record["abstract"]
                }
                
                out.write(json.dumps(ingestion_doc) + "\n")
                count += 1
        
        self.logger.info(f"Wrote {count} papers to {self.output_jsonl}")
        
        # Summary
        total_size = sum(p.stat().st_size for p in self.pdf_dir.glob("*.pdf"))
        self.logger.info(f"Total PDF size: {total_size / (1024**3):.2f} GB")


def main():
    parser = argparse.ArgumentParser(description="Production-grade arXiv downloader")
    parser.add_argument("--storage-path", required=True, help="Storage directory")
    parser.add_argument("--categories", default="cs.AI,cs.CV,cs.NE,cs.CL,cs.LG", help="Categories to fetch")
    parser.add_argument("--min-date", default="2017-02-27", help="Minimum date (YYYY-MM-DD)")
    parser.add_argument("--max-papers", type=int, default=None, help="Max papers (for testing)")
    parser.add_argument("--max-workers", type=int, default=8, help="Parallel workers")
    
    args = parser.parse_args()
    
    downloader = ArxivDownloader(args.storage_path)
    
    try:
        # Fetch IDs
        paper_ids = downloader.fetch_paper_ids(args.categories, args.min_date)
        if args.max_papers:
            paper_ids = paper_ids[:args.max_papers]
        
        # Download with retries
        downloader.download_papers(paper_ids, max_workers=args.max_workers, max_retries=3)
        
        # Generate manifest
        downloader.generate_manifest()
        
        downloader.logger.info("✅ Complete!")
    
    except KeyboardInterrupt:
        downloader.logger.info("Interrupted by user")
        sys.exit(0)
    except Exception as e:
        downloader.logger.exception(f"Fatal error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
