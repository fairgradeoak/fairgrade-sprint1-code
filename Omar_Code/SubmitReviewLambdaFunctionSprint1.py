import json
import os
import pg8000

def lambda_handler(event, context):
    try:
        # Parse the JSON payload from the frontend
        body = json.loads(event.get('body', '{}'))
        grade_id = body.get('grade_id')
        final_score = body.get('score')
        feedback = body.get('instructor_feedback')

        if not grade_id or final_score is None:
            return {'statusCode': 400, 'body': json.dumps({"error": "Missing grade_id or score"})}

        # Connect to your RDS PostgreSQL database
        conn = pg8000.connect(
            host=os.environ.get('DB_HOST'),
            database=os.environ.get('DB_NAME'),
            user=os.environ.get('DB_USER'),
            password=os.environ.get('DB_PASSWORD')
        )
        cur = conn.cursor()
        
        # Update the grade, add the feedback, and remove it from the review queue
        query = """
            UPDATE grades 
            SET score = %s, instructor_feedback = %s, needs_review = FALSE 
            WHERE id = %s;
        """
        cur.execute(query, (final_score, feedback, grade_id))
        conn.commit()
        
        cur.close()
        conn.close()
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({"message": "Review submitted successfully!"})
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({"error": str(e)})
        }