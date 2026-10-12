from typing import List, Dict
from pydantic import BaseModel, field_validator, model_validator


class AiResponse(BaseModel):
    confidence: float
    student_feedback: str
    instructor_feedback: str
    criteria_count: int # Used to validate if all criteria are included
    rubric_breakdown: List[Dict]

    @field_validator("confidence")
    def validate_confidence(confidence):
        if(confidence > 1 or confidence < 0 ):
            raise ValueError(f"confidence should be between 0 and 1, received value is: {confidence}")
        return confidence

    # This function iterates over the keys in each criteria dictionary and checks if they are valid
    @field_validator("rubric_breakdown")
    def validate_rubric_keys(rb):
        for criteria_dict in rb:
            for key in criteria_dict:
                if (key not in ["criteria_id","score"]):
                    raise ValueError(f"the key '{key}' is not valid for criteria dictionary")

        return rb

    @field_validator("rubric_breakdown")
    def validate_criteria_ids(rb):
        for criteria_dict in rb:
            id = criteria_dict["criteria_id"]
            if (id[0] != "c" or (not id[1:].isdigit())):
                raise ValueError(f"{id} is not a valid criteria id")
    
        return rb

    @field_validator("rubric_breakdown")
    def validate_criteria_scores(rb):
        for criteria_dict in rb:
            score = criteria_dict["score"]
            if(score > 1 or score < 0):
                raise ValueError(f"criteria score should be between 0 and 1, received value: {score}")
    
        return rb

    @model_validator(mode="after")
    def validate_criteria_count(self):
        if(len(self.rubric_breakdown) != self.criteria_count):
            raise ValueError(f"""Criteria amount mismatch. Question had {self.criteria_count}, ai gave {len(self.rubric_breakdown)} as:
{self.rubric_breakdown}
""")
        return self