# External 
from google import genai
from google.genai import types

# Built-in
from dotenv import load_dotenv
import os
import json

# Project
from ai_response import AiResponse
from prompt_generator import PromptGenerator
from text_grader import TextGrader

class GeminiClient:
    # fetching environment variables
    # initializing client
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    gemini_model = os.getenv("GEMINI_MODEL")
    client = genai.Client(api_key=api_key)

    # this is the only method that directly calls the api
    @classmethod
    def send_request(cls, prompt):
        return (cls.client.models.generate_content(model=cls.gemini_model, contents=prompt).text).strip()

    @classmethod
    def review_text_submission(cls, question, answer):
        # object to generate prompts
        prompts = PromptGenerator(question,answer)
        
        # checks if the answer is a prompt injection
        is_injection = GeminiClient.send_request(prompts.check_prompt_injection())
        
        if(is_injection == "0"):
            grading_prompt = prompts.get_grading_prompt()
                    
            response = GeminiClient.send_request(grading_prompt)
            assessment_json = json.loads(response)

            # class used to apply pydantic on the ai response for validation
            ai_assessment = AiResponse(confidence=float(assessment_json["confidence"]), 
                                            student_feedback=assessment_json["student_feedback"],
                                            instructor_feedback=assessment_json["instructor_feedback"],
                                            criteria_count=len(question.rubric),
                                            rubric_breakdown=assessment_json["rubric_breakdown"])
        
            # creating a TextGrader object
            text_grader = TextGrader(ai_assessment=ai_assessment,question_rubric=question.rubric,max_points=question.max_points)

            return text_grader.final_assessment()

        else:
            return "Prompt Injection Detected"