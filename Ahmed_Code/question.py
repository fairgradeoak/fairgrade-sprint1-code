class Question:
    def __init__(self, subject_name, subject_description, question_text, question_type, model_answer, max_points, rubric):
        self.subject_name = subject_name
        self.subject_description = subject_description
        self.question_text = question_text
        self.question_type = question_type
        self.model_answer = model_answer
        self.max_points = max_points
        self.rubric = rubric # List containing a dict of {"id": criteria id, "requirement": explain the criteria, "weight_fraction": float between 0 and 1}

    def __str__(self):
        return f"""Subject: {self.subject_name},
Subject Description: {self.subject_description},
Question: {self.question_text},
Question Type: {self.question_type},
Model Answer: {self.model_answer},
Points: {self.max_points},
Rubric: {self.rubric},
"""