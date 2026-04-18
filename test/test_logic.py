import pytest
from unittest.mock import MagicMock, patch
from data_service import fetch_venues_from_bq

# --- TEST 7: Budget Fallback Logic (Unit Test) ---
def test_budget_fallback_logic():
    """Ensures code doesn't crash on invalid budget and uses a default."""
    with patch('google.cloud.bigquery.Client.from_service_account_json') as mock_client:
        # Pass a budget that doesn't exist in our map
        fetch_venues_from_bq(['cafe'], budget='luxury-tier')
        
        # Verify it defaulted to 'PRICE_LEVEL_MODERATE' (or your chosen default)
        _, kwargs = mock_client.return_value.query.call_args
        price_param = kwargs['job_config'].query_parameters[1]
        assert price_param.value == "PRICE_LEVEL_MODERATE"

# --- TEST 8: Schema Contract & Null Handling (Unit Test) ---
@patch('google.cloud.bigquery.Client.from_service_account_json')
def test_schema_contract_and_null_rating(mock_client):
    """Verifies output keys match requirements and NULL ratings become 0.0."""
    mock_query_job = MagicMock()
    # Mock a row with a missing rating (common in real data)
    mock_row = MagicMock(
        display_name="Empty Spot", 
        primary_type="park", 
        rating=None, 
        price_level="1", 
        latitude=37.7, 
        longitude=-122.4
    )
    mock_query_job.result.return_value = [mock_row]
    mock_client.return_value.query.return_value = mock_query_job
    
    results = fetch_venues_from_bq(['park'], 'low')
    
    # 1. Check Null Handling
    assert results[0]['rating'] == 0.0
    # 2. Check Key Names (The "Contract" for Saisri/PJ)
    expected_keys = {"name", "category", "rating", "latitude", "longitude", "distance_km"}
    assert expected_keys.issubset(results[0].keys())

# --- TEST 9: Empty Result Graceful Return (Functional) ---
@patch('google.cloud.bigquery.Client.from_service_account_json')
def test_empty_query_returns_list(mock_client):
    """Ensures function returns an empty list instead of crashing when no rows found."""
    mock_query_job = MagicMock()
    mock_query_job.result.return_value = [] # Empty iterator
    mock_client.return_value.query.return_value = mock_query_job
    
    results = fetch_venues_from_bq(['non_existent_category'], 'low')
    assert isinstance(results, list)
    assert len(results) == 0

# --- TEST 10: SQL Injection Prevention (Security) ---
@patch('google.cloud.bigquery.Client.from_service_account_json')
def test_parameterization_safety(mock_client):
    """Confirms categories are passed as parameters, not raw strings."""
    malicious_input = ["cafe'); DROP TABLE venues;--"]
    fetch_venues_from_bq(malicious_input, 'medium')
    
    _, kwargs = mock_client.return_value.query.call_args
    params = kwargs['job_config'].query_parameters
    
    # Check that the first parameter is an ArrayQueryParameter
    # This proves the input is treated as DATA, not CODE
    assert params[0].name == "categories"
    assert params[0].values == malicious_input