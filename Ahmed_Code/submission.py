# External
from gemini_client import GeminiClient
import judge0

class Submission:
    def submit_text_question(question, answer):
        return GeminiClient.review_text_submission(question=question, answer=answer)

    # test case must be in the form: [(predfined input, expected output)]
    def submit_code_question(coding_question, submitted_code):
        # judge0 runs the test cases 
        # it returns a list of each test case status ["Accepted", "Wrong Answer", "Runtime Error", ...]
        # 
        # The array i used to creat the following dictionary structure
        '''
        {
        "test_1":
            {"test_case": {
                "input": "2",
                "expected_output": "4"
                },
            "status": "pass"
            },
        "test_2": {"test_case": "john", "status": "doe"}
        }
        '''
        # question data, student answer/code, and the generated dicionary of test case will all be sent to the GeminiClient class
        pass