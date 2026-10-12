from question import Question

class CodingQuestion(Question):
    def __init__(self, subject_name, subject_description, question_text, question_type,
        model_answer, max_points, rubric, language_id, test_cases):
        
        super().__init__(subject_name, subject_description, question_text, question_type,
            model_answer, max_points, rubric)

        self.language_id = language_id
        self.test_cases = test_cases
