#!/usr/bin/env python3

"""
Fetch arXiv papers and prepare for AI Search ingestion.
Usage: python3 scripts/fetch-arxiv-papers.py --year 2025 --category cs.AI --max 100
"""

import json
import sys
import argparse
from datetime import datetime
from urllib.request import urlopen
from urllib.parse import urlencode
import xml.etree.ElementTree as ET


def fetch_arxiv_papers(category="cs.AI", start_date="202501010000", end_date="202512312359", max_results=50):
    """Fetch papers from arXiv API."""
    
    # Build query
    query = f"cat:{category} AND submittedDate:[{start_date} TO {end_date}]"
    
    params = {
        "search_query": query,
        "start": 0,
        "max_results": max_results,
        "sortBy": "submittedDate",
        "sortOrder": "descending"
    }
    
    url = f"https://export.arxiv.org/api/query?{urlencode(params)}"
    
    print(f"📥 Fetching papers from arXiv...", file=sys.stderr)
    print(f"Query: {query}", file=sys.stderr)
    
    try:
        response = urlopen(url)
        feed = ET.parse(response)
        root = feed.getroot()
    except Exception as e:
        print(f"❌ Error fetching from arXiv: {e}", file=sys.stderr)
        sys.exit(1)
    
    papers = []
    ns = {
        'atom': 'http://www.w3.org/2005/Atom',
        'arxiv': 'http://arxiv.org/schemas/atom'
    }
    
    for entry in root.findall('atom:entry', ns):
        try:
            # Extract fields
            arxiv_id = entry.find('atom:id', ns).text.split('/abs/')[-1]
            title = entry.find('atom:title', ns).text.strip()
            abstract = entry.find('atom:summary', ns).text.strip()
            published = entry.find('atom:published', ns).text
            
            # Extract authors
            authors = []
            for author in entry.findall('atom:author', ns):
                name = author.find('atom:name', ns).text
                authors.append(name)
            
            # Get PDF URL
            pdf_url = None
            for link in entry.findall('atom:link', ns):
                if link.get('title') == 'pdf':
                    pdf_url = link.get('href')
                    break
            
            if not pdf_url:
                pdf_url = f"https://arxiv.org/pdf/{arxiv_id}"
            
            paper = {
                "arxiv_id": arxiv_id,
                "title": title,
                "abstract": abstract,
                "authors": authors,
                "published": published[:10],  # YYYY-MM-DD format
                "category": category,
                "pdf_url": pdf_url
            }
            
            papers.append(paper)
        
        except Exception as e:
            print(f"⚠️  Error parsing entry: {e}", file=sys.stderr)
            continue
    
    return papers


def main():
    parser = argparse.ArgumentParser(description="Fetch arXiv papers for AI Search ingestion")
    parser.add_argument("--year", default="2025", help="Year to fetch papers from")
    parser.add_argument("--category", default="cs.AI", help="arXiv category")
    parser.add_argument("--max", type=int, default=50, help="Maximum papers to fetch")
    parser.add_argument("--output", help="Output JSON file (default: stdout)")
    
    args = parser.parse_args()
    
    # Calculate date range
    year = args.year
    start_date = f"{year}01010000"
    end_date = f"{year}12312359"
    
    # Fetch papers
    papers = fetch_arxiv_papers(
        category=args.category,
        start_date=start_date,
        end_date=end_date,
        max_results=args.max
    )
    
    print(f"✅ Fetched {len(papers)} papers", file=sys.stderr)
    
    # Output
    output = {
        "timestamp": datetime.now().isoformat(),
        "category": args.category,
        "year": args.year,
        "count": len(papers),
        "papers": papers
    }
    
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"📄 Saved to: {args.output}", file=sys.stderr)
    else:
        print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
