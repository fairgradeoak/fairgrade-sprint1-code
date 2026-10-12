from typing import List, Dict
from pydantic import BaseModel, field_validator, model_validator
import json

from ai_response import AiResponse

class TextGrader(BaseModel):
    ai_assessment: AiResponse # used to fetch data given by the ai
    question_rubric: List[Dict] # used to compare the ai assessment of the rubric against the real one
    max_points: float

    def final_assessment(self):
        result = {"grade": self.calculate_score(),
                  "max_grade": self.max_points,
                  "confidence": self.ai_assessment.confidence,
                  "needs_review": self.needs_review(),
                  "student_feedback": self.ai_assessment.student_feedback,
                  "instructor_feedback": self.ai_assessment.instructor_feedback,
                  "rubric_breakdown": self.ai_assessment.rubric_breakdown
                  }

        return json.dumps(result)

    def needs_review(self):
        if(self.ai_assessment.confidence < 0.75):
            return True
        else:
            return False

    def calculate_score(self):
        final_score = 0
        rubric_breakdown = self.ai_assessment.rubric_breakdown

        for criteria_breakdown in rubric_breakdown:
            id = criteria_breakdown['criteria_id']
            breakdown_score = criteria_breakdown['score']
            
            for criteria in self.question_rubric:
                if(criteria["id"] == id):
                    final_score += criteria["weight_fraction"] * breakdown_score
                    break

        final_score *= self.max_points
        return(round(final_score,2))