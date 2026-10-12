# FairGrade Backend (Sprint 1)

Owner: Omar Moustafa Aleraky. Cloud and backend for the FairGrade exam platform. This folder is a read-only copy for review; it is not meant to be run from here, because it needs the AWS resources described below.

## Contents

- `CreateExamLambdaFunctionSprint1.py` is the main API router. It serves the exam, question, submission, grade and upload routes, and calls the AI grading modules (see the AI grading folder).
- `GetReviewQueueLambdaFunctionSprint1.py` lists gradings flagged for instructor review.
- `SubmitReviewLambdaFunctionSprint1.py` stores an instructor's review decision.
- `schema.sql` is the PostgreSQL schema (seven tables) as of the end of Sprint 1. Planned Sprint 2 changes are in the Design Document, Section 6.

## API routes

POST /exams, GET /exams/{id}, GET /exams/{id}/questions, POST /exams/{id}/submit, POST /questions, POST /submissions, GET /grades/{id}, GET /upload-url, GET /reviews, POST /reviews

## Stack

Python on AWS Lambda behind API Gateway (HTTP API), Cognito for authentication, RDS PostgreSQL, S3 with presigned uploads, CloudWatch logging. Region: eu-north-1. Libraries: `pg8000`, `boto3`. The router also imports `question.py` and `gemini_client.py`, which are packaged into the Lambda from the AI grading folder when deployed.

## Configuration

Environment variables (names only, no values are stored here): `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, plus the Gemini API settings used by the grading module.

## Deployment

The live functions are deployed automatically by a GitHub Actions workflow in the team's original private repository on every push to main.

## Status

Known issues and the Sprint 2 hardening plan are in the Design Document, Section 9.