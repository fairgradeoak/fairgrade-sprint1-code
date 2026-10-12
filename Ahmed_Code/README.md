# FairGrade AI Grading Module (Sprint 1)

Owner: Ahmed Sabbah Quraiba. Python modules that grade a student's text answer against a rubric using the Gemini API.

## Files

- `question.py`: the Question data object (text, model answer, points, rubric).
- `submission.py`: the Submission class. `submit_text_question` is the working entry point; `submit_code_question` is a stub.
- `gemini_client.py`: `GeminiClient.review_text_submission` runs the full pipeline.
- `prompt_generator.py`: builds the injection-check and grading prompts.
- `ai_response.py`: Pydantic validation of the model's output.
- `text_grader.py`: older version of grader.py, used for aws integration test.
- `grader.py`: computes the final grade and the `needs_review` flag.
- `coding_question.py`: extends Question for coding questions (planned use).

## Pipeline

1. A separate Gemini call checks the answer for prompt injection; if flagged, grading is skipped.
2. A grading call scores each rubric criterion from 0 to 1 and returns JSON.
3. Pydantic validates the output.
4. The final grade is computed in code from the rubric weights.
5. `needs_review` is set when confidence is below 0.75 (a placeholder until calibrated).

The result contains `grade`, `max_grade`, `rubric_breakdown`, `confidence`, `needs_review`, `student_feedback` and `instructor_feedback`.


## Status

Text-answer grading is implemented and integrated with the backend. Planned for Sprint 2: Judge0 and coding-question grading, retry logic, and threshold calibration.