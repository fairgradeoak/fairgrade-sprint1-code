import json
import os
import pg8000

def lambda_handler(event, context):
    try:
        # Connect to your RDS PostgreSQL database
        conn = pg8000.connect(
            host=os.environ.get('DB_HOST'),
            database=os.environ.get('DB_NAME'),
            user=os.environ.get('DB_USER'),
            password=os.environ.get('DB_PASSWORD')
        )
        cur = conn.cursor()
        
        # Updated query to match your actual columns in DBeaver
        cur.execute("SELECT id, submission_id, score, confidence, criteria_breakdown FROM grades WHERE needs_review = TRUE;")
        rows = cur.fetchall()
        
        # Format the results into a list
        reviews = []
        for row in rows:
            reviews.append({
                "grade_id": row[0],
                "submission_id": row[1],
                "score": float(row[2]) if row[2] is not None else None,
                "confidence": float(row[3]) if row[3] is not None else None,
                "criteria_breakdown": row[4]
            })
            
        cur.close()
        conn.close()
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            # default=str ensures complex types like JSON/decimals serialize safely
            'body': json.dumps({"reviews": reviews}, default=str)
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({"error": str(e)})
        }