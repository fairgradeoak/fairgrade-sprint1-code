import json
import pg8000.dbapi
import os
import boto3
import logging
from question import Question
from gemini_client import GeminiClient

# Initialize logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def get_db_connection():
    return pg8000.dbapi.connect(
        host=os.environ.get('DB_HOST'),
        database=os.environ.get('DB_NAME'),
        user=os.environ.get('DB_USER'),
        password=os.environ.get('DB_PASSWORD')
    )

def validate_payload(body, expected_fields):
    errors = []
    for field, expected_type in expected_fields.items():
        if field not in body:
            errors.append(f"Missing required field: '{field}'")
        elif not isinstance(body[field], expected_type):
            errors.append(f"Field '{field}' must be of type {expected_type.__name__}")
    return errors

def check_permissions(event, required_group):
    try:
        claims = event['requestContext']['authorizer']['jwt']['claims']
        groups = claims.get('cognito:groups', [])
        
        if isinstance(groups, str):
            groups = groups.strip('[]').replace('"', '').replace(' ', '').split(',')
            
        return required_group in groups
    except KeyError:
        return False

def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")
    
    route_key = event.get('routeKey', '')
    
    try:
        body = json.loads(event.get('body', '{}')) if event.get('body') else {}
    except json.JSONDecodeError:
        logger.error("JSONDecodeError: Invalid JSON format received")
        return {"statusCode": 400, "body": json.dumps({"error": "Invalid JSON format"})}

    # ---------------------------------------------------------
    # ROUTE: Create Exam
    # ---------------------------------------------------------
    if route_key == "POST /exams":
        if not check_permissions(event, 'Instructor'):
            return {"statusCode": 403, "body": json.dumps({"error": "Forbidden: Instructors only"})}
            
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO exams (course_id, title, total_points) VALUES (%s, %s, %s) RETURNING id;",
                (body.get('course_id'), body.get('title'), body.get('total_points'))
            )
            exam_id = cursor.fetchone()[0]
            conn.commit()
            return {"statusCode": 201, "body": json.dumps({"message": "Exam created!", "exam_id": str(exam_id)})}
        except Exception as e:
            logger.error(f"Error creating exam: {str(e)}")
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
        finally:
            cursor.close()
            conn.close()

    # ---------------------------------------------------------
    # ROUTE: Create Question
    # ---------------------------------------------------------
    elif route_key == "POST /questions":
        errors = validate_payload(body, {'exam_id': str, 'question_text': str, 'points': int})
        if errors: return {"statusCode": 400, "body": json.dumps({"errors": errors})}
        
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO questions (exam_id, question_text, points) VALUES (%s, %s, %s) RETURNING id;",
                (body['exam_id'], body['question_text'], body['points'])
            )
            question_id = cursor.fetchone()[0]
            conn.commit()
            return {"statusCode": 201, "body": json.dumps({"message": "Question created!", "question_id": str(question_id)})}
        except Exception as e:
            logger.error(f"Error creating question: {str(e)}")
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
        finally:
            cursor.close()
            conn.close()

    # ---------------------------------------------------------
    # ROUTE: Submit Answer & AI Grading Integration
    # ---------------------------------------------------------
    elif route_key == "POST /submissions":
        if not check_permissions(event, 'Student'):
            return {"statusCode": 403, "body": json.dumps({"error": "Forbidden: Students only"})}

        errors = validate_payload(body, {'student_id': str, 'exam_id': str, 'question_id': str, 'answer_text': str})
        if errors: return {"statusCode": 400, "body": json.dumps({"errors": errors})}
        
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            # 1. Insert student submission
            cursor.execute(
                "INSERT INTO submissions (student_id, exam_id, question_id, answer_text) VALUES (%s, %s, %s, %s) RETURNING id;",
                (body['student_id'], body['exam_id'], body['question_id'], body['answer_text'])
            )
            submission_id = cursor.fetchone()[0]

            # 2. Fetch question, rubric, and course metadata for Ahmed's Question class
            cursor.execute("""
                SELECT c.course_name, c.course_code, q.question_text, 'short_answer' as type, q.model_answer, q.points, q.rubric
                FROM questions q
                JOIN exams e ON q.exam_id = e.id
                JOIN courses c ON e.course_id = c.id
                WHERE q.id = %s;
            """, (body['question_id'],))
            q_data = cursor.fetchone()
            
            if not q_data:
                raise Exception("Question context could not be found.")

            question_obj = Question(
                subject_name=q_data[0],
                subject_description=q_data[1],
                question_text=q_data[2],
                question_type=q_data[3],
                model_answer=q_data[4],
                max_points=q_data[5],
                rubric=q_data[6] if isinstance(q_data[6], list) else json.loads(q_data[6])
            )

            # 3. Call grading pipeline
            assessment_result = GeminiClient.review_text_submission(question_obj, body['answer_text'])

            # 4. Write output to grades table
            if assessment_result == "Prompt Injection Detected":
                cursor.execute("""
                    INSERT INTO grades (submission_id, score, confidence, needs_review, instructor_feedback, student_feedback) 
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (submission_id, 0, 1.0, True, 'FLAGGED: Prompt Injection Detected', 'Your submission was flagged for review.'))
            else:
                assessment = json.loads(assessment_result)
                cursor.execute("""
                    INSERT INTO grades (submission_id, score, criteria_breakdown, confidence, needs_review, instructor_feedback, student_feedback)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    submission_id, 
                    assessment['grade'], 
                    json.dumps(assessment['rubric_breakdown']), 
                    assessment['confidence'], 
                    assessment['needs_review'], 
                    assessment['instructor_feedback'], 
                    assessment['student_feedback']
                ))

            conn.commit()
            return {
                "statusCode": 201, 
                "body": json.dumps({
                    "message": "Answer submitted and graded successfully!", 
                    "submission_id": str(submission_id)
                })
            }
        except Exception as e:
            logger.error(f"Error in submit and grade pipeline: {str(e)}")
            conn.rollback()
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
        finally:
            cursor.close()
            conn.close()

    # ---------------------------------------------------------
    # ROUTE: Fetch Grade
    # ---------------------------------------------------------
    elif route_key.startswith("GET /grades/"):
        path_params = event.get('pathParameters', {})
        submission_id = path_params.get('id')
        
        if not submission_id:
            logger.error("Missing submission ID in URL")
            return {"statusCode": 400, "body": json.dumps({"error": "Missing submission ID in URL"})}

        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT score, instructor_feedback FROM grades WHERE submission_id = %s;", (submission_id,))
            result = cursor.fetchone()
            if result:
                return {"statusCode": 200, "body": json.dumps({"score": result[0], "feedback": result[1]})}
            else:
                return {"statusCode": 404, "body": json.dumps({"error": "Grade not found"})}
        except Exception as e:
            logger.error(f"Error fetching grade: {str(e)}")
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
        finally:
            cursor.close()
            conn.close()

    # ---------------------------------------------------------
    # ROUTE: Generate S3 Presigned URL
    # ---------------------------------------------------------
    elif route_key == "GET /upload-url":
        query_params = event.get('queryStringParameters', {})
        file_name = query_params.get('file_name')
        
        if not file_name:
            logger.error("Missing file_name in query parameters")
            return {"statusCode": 400, "body": json.dumps({"error": "Missing file_name in query parameters"})}
            
        s3_client = boto3.client('s3', region_name='eu-north-1', endpoint_url='https://s3.eu-north-1.amazonaws.com')
        bucket_name = "fairgrade-submission-oak" 
        
        try:
            presigned_url = s3_client.generate_presigned_url(
                'put_object',
                Params={'Bucket': bucket_name, 'Key': file_name},
                ExpiresIn=3600
            )
            logger.info(f"Successfully generated presigned URL for file: {file_name}")
            return {"statusCode": 200, "body": json.dumps({"upload_url": presigned_url, "file_name": file_name})}
        except Exception as e:
            logger.error(f"Error generating URL: {str(e)}")
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

    # ---------------------------------------------------------
    # ROUTE: Fetch Assigned Exam Details 
    # ---------------------------------------------------------
    elif route_key == "GET /exams/{id}":
        exam_id = event.get('pathParameters', {}).get('id')
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT id, title, total_points FROM exams WHERE id = %s;", (exam_id,))
            exam = cursor.fetchone()
            if exam:
                return {"statusCode": 200, "body": json.dumps({"id": str(exam[0]), "title": exam[1], "total_points": exam[2]})}
            return {"statusCode": 404, "body": json.dumps({"error": "Exam not found"})}
        except Exception as e:
            logger.error(f"Error fetching exam: {str(e)}")
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
        finally:
            cursor.close()
            conn.close()

    # ---------------------------------------------------------
    # ROUTE: Fetch Questions Without Exposing Answers 
    # ---------------------------------------------------------
    elif route_key == "GET /exams/{id}/questions":
        exam_id = event.get('pathParameters', {}).get('id')
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT id, question_text, points FROM questions WHERE exam_id = %s;", (exam_id,))
            questions = cursor.fetchall()
            question_list = [{"question_id": str(q[0]), "question_text": q[1], "points": q[2]} for q in questions]
            return {"statusCode": 200, "body": json.dumps({"questions": question_list})}
        except Exception as e:
            logger.error(f"Error fetching questions: {str(e)}")
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
        finally:
            cursor.close()
            conn.close()

    # ---------------------------------------------------------
    # ROUTE: Finalize Exam Submission 
    # ---------------------------------------------------------
    elif route_key == "POST /exams/{id}/submit":
        exam_id = event.get('pathParameters', {}).get('id')
        student_id = body.get('student_id')
        
        if not student_id:
            return {"statusCode": 400, "body": json.dumps({"error": "Missing student_id in body"})}
            
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                """INSERT INTO exam_attempts (exam_id, student_id, status) 
                   VALUES (%s, %s, 'completed') 
                   ON CONFLICT (exam_id, student_id) 
                   DO UPDATE SET status = 'completed', completed_at = CURRENT_TIMESTAMP;""",
                (exam_id, student_id)
            )
            conn.commit()
            return {"statusCode": 200, "body": json.dumps({"message": "Exam finalized successfully"})}
        except Exception as e:
            logger.error(f"Error finalizing exam: {str(e)}")
            return {"statusCode": 500, "body": json.dumps({"error": str(e)})}
        finally:
            cursor.close()
            conn.close()

    # ---------------------------------------------------------
    # FALLBACK
    # ---------------------------------------------------------
    else:
        logger.warning(f"Route not found: {route_key}")
        return {"statusCode": 404, "body": json.dumps({"error": f"Route {route_key} not found"})}