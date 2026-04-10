from google.cloud import bigquery
from typing import List, Dict, Any
import os

client = bigquery.Client(project="mlops-project-491402")

def fetch_venues_from_bq(categories: List[str], budget: str) -> List[Dict[str, Any]]:
    """
    Connects to BigQuery to pull real SF venues.
    Translates user budget (low/medium/high) to BigQuery price levels (1, 2, 3).
    """
    
    # 1. Map the user's budget string to the numeric price_level in your BQ table
    # Based on Google Places API: 1=Cheap, 2=Moderate, 3=Expensive, 4=Very Expensive
    price_map = {
        "low": 1,
        "medium": 2,
        "high": 3
    }
    target_price = price_map.get(budget.lower(), 2)

    # 2. Build the query using Parameterized inputs to prevent SQL Injection
    # We use UNNEST to match the list of categories against the BQ table
    query = """
        SELECT 
            name, 
            primary_type as category, 
            rating, 
            price_level, 
            latitude, 
            longitude
        FROM `mlops-project-491402.places_raw.venues`
        WHERE primary_type IN UNNEST(@categories)
        AND price_level = @price
        LIMIT 40
    """

    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("categories", "STRING", categories),
            bigquery.ScalarQueryParameter("price", "INTEGER", target_price),
        ]
    )

    try:
        query_job = client.query(query, job_config=job_config)
        results = query_job.result()

        real_venues = []
        for row in results:
            # We add a default distance_km of 0.0 because the decision_engine 
            # expects this field to exist for its scoring math.
            real_venues.append({
                "name": row.name,
                "category": row.category,
                "rating": row.rating if row.rating else 0.0,
                "price_level": str(row.price_level),
                "latitude": row.latitude,
                "longitude": row.longitude,
                "distance_km": 0.0  
            })
        
        return real_venues

    except Exception as e:
        print(f"Error querying BigQuery: {e}")
        return []