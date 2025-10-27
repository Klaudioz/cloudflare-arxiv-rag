#!/usr/bin/env python3
"""
Reformat papers JSON for Cloudflare AI Search ingestion.

AI Search expects individual documents, not a single wrapped array.
This script converts papers-2025.json into individual JSON files
that AI Search can properly index.
"""

import json
import os
from pathlib import Path

def reformat_papers_for_ai_search():
    """Convert papers-2025.json into individual paper files."""
    
    # Read the original file
    input_file = Path("papers-2025.json")
    if not input_file.exists():
        print(f"Error: {input_file} not found")
        return False
    
    with open(input_file, "r") as f:
        data = json.load(f)
    
    papers = data.get("papers", [])
    if not papers:
        print("Error: No papers found in JSON")
        return False
    
    print(f"Found {len(papers)} papers to reformat")
    
    # Create output directory for individual papers
    output_dir = Path("papers-formatted")
    output_dir.mkdir(exist_ok=True)
    
    # Write each paper as a separate JSON file
    for i, paper in enumerate(papers, 1):
        # Use arxiv_id as filename (with .json extension)
        arxiv_id = paper.get("arxiv_id", f"paper_{i}")
        filename = output_dir / f"{arxiv_id}.json"
        
        # Format each paper as a standalone document
        # AI Search will automatically extract and chunk the content
        formatted_paper = {
            "title": paper.get("title", "").strip(),
            "abstract": paper.get("abstract", "").strip(),
            "authors": ", ".join(paper.get("authors", [])),
            "published": paper.get("published", ""),
            "category": paper.get("category", ""),
            "arxiv_id": arxiv_id,
            "pdf_url": paper.get("pdf_url", ""),
            # Combine title + abstract for better indexing
            "content": f"{paper.get('title', '').strip()}\n\n{paper.get('abstract', '').strip()}"
        }
        
        with open(filename, "w") as f:
            json.dump(formatted_paper, f, indent=2)
        
        if i % 20 == 0:
            print(f"  Wrote {i}/{len(papers)} papers...")
    
    print(f"\n✓ Successfully created {len(papers)} individual JSON files in {output_dir}/")
    print(f"  Next step: Upload contents of '{output_dir}/' to R2 bucket")
    return True

def create_single_concatenated_file():
    """
    Alternative format: Create a single JSON file with papers as array
    (but cleaner structure for AI Search).
    """
    input_file = Path("papers-2025.json")
    if not input_file.exists():
        print(f"Error: {input_file} not found")
        return False
    
    with open(input_file, "r") as f:
        data = json.load(f)
    
    papers = data.get("papers", [])
    
    # Create clean format: array of documents (no wrapper)
    output_file = Path("papers-2025-clean.json")
    
    # AI Search can handle JSONL (JSON Lines) format better
    # Each line is a separate JSON object
    with open(output_file, "w") as f:
        for paper in papers:
            clean_paper = {
                "title": paper.get("title", "").strip(),
                "abstract": paper.get("abstract", "").strip(),
                "authors": ", ".join(paper.get("authors", [])),
                "published": paper.get("published", ""),
                "category": paper.get("category", ""),
                "arxiv_id": paper.get("arxiv_id", ""),
                "pdf_url": paper.get("pdf_url", ""),
            }
            f.write(json.dumps(clean_paper) + "\n")
    
    print(f"✓ Created clean JSONL file: {output_file}")
    print(f"  This file has {len(papers)} lines (one paper per line)")
    print(f"  Upload this to R2 as: papers-2025-clean.jsonl")
    return True

if __name__ == "__main__":
    print("=" * 60)
    print("Cloudflare AI Search - Paper Reformatting Tool")
    print("=" * 60)
    
    print("\n1. Creating individual JSON files (recommended)...")
    success1 = reformat_papers_for_ai_search()
    
    print("\n2. Creating JSONL format file (alternative)...")
    success2 = create_single_concatenated_file()
    
    if success1 or success2:
        print("\n" + "=" * 60)
        print("NEXT STEPS:")
        print("=" * 60)
        print("\nOption A: Upload individual files (better for AI Search)")
        print("  1. Upload everything from 'papers-formatted/' to R2")
        print("  2. Configure AI Search to sync from the R2 bucket")
        print("  3. AI Search will index each JSON file separately")
        print("\nOption B: Upload JSONL file")
        print("  1. Upload 'papers-2025-clean.jsonl' to R2")
        print("  2. Configure AI Search to use this file")
        print("\nTo upload manually:")
        print("  aws s3 sync papers-formatted/ s3://your-bucket/papers/ --no-progress")
        print("\nFor now, manually upload one of these options to your R2 bucket,")
        print("then trigger a sync in Cloudflare AI Search dashboard.")
