-- public.users definition

-- Drop table

-- DROP TABLE public.users;

CREATE TABLE public.users (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	cognito_sub varchar(255) NOT NULL,
	email varchar(255) NOT NULL,
	"role" varchar(50) NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT users_cognito_sub_key UNIQUE (cognito_sub),
	CONSTRAINT users_cognito_sub_not_null NOT NULL cognito_sub,
	CONSTRAINT users_email_key UNIQUE (email),
	CONSTRAINT users_email_not_null NOT NULL email,
	CONSTRAINT users_id_not_null NOT NULL id,
	CONSTRAINT users_pkey PRIMARY KEY (id),
	CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['student'::character varying, 'instructor'::character varying, 'admin'::character varying])::text[]))),
	CONSTRAINT users_role_not_null NOT NULL role
);


-- public.courses definition

-- Drop table

-- DROP TABLE public.courses;

CREATE TABLE public.courses (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	instructor_id uuid NOT NULL,
	course_code varchar(50) NOT NULL,
	course_name varchar(255) NOT NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT courses_course_code_not_null NOT NULL course_code,
	CONSTRAINT courses_course_name_not_null NOT NULL course_name,
	CONSTRAINT courses_id_not_null NOT NULL id,
	CONSTRAINT courses_instructor_id_not_null NOT NULL instructor_id,
	CONSTRAINT courses_pkey PRIMARY KEY (id),
	CONSTRAINT courses_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.users(id) ON DELETE CASCADE
);


-- public.exams definition

-- Drop table

-- DROP TABLE public.exams;

CREATE TABLE public.exams (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	course_id uuid NOT NULL,
	title varchar(255) NOT NULL,
	total_points int4 NOT NULL,
	rubric_s3_key varchar(1024) NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT exams_course_id_not_null NOT NULL course_id,
	CONSTRAINT exams_id_not_null NOT NULL id,
	CONSTRAINT exams_pkey PRIMARY KEY (id),
	CONSTRAINT exams_title_not_null NOT NULL title,
	CONSTRAINT exams_total_points_not_null NOT NULL total_points,
	CONSTRAINT exams_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE
);


-- public.questions definition

-- Drop table

-- DROP TABLE public.questions;

CREATE TABLE public.questions (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	exam_id uuid NULL,
	question_text text NULL,
	points int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	model_answer text NULL,
	rubric jsonb NULL,
	CONSTRAINT questions_id_not_null NOT NULL id,
	CONSTRAINT questions_pkey PRIMARY KEY (id),
	CONSTRAINT questions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE
);


-- public.submissions definition

-- Drop table

-- DROP TABLE public.submissions;

CREATE TABLE public.submissions (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	exam_id uuid NOT NULL,
	student_id uuid NOT NULL,
	submission_s3_key varchar(1024) NULL,
	status varchar(50) DEFAULT 'pending'::character varying NOT NULL,
	ai_score numeric(5, 2) NULL,
	ai_feedback text NULL,
	created_at timestamptz DEFAULT CURRENT_TIMESTAMP NULL,
	question_id uuid NULL,
	answer_text text NULL,
	CONSTRAINT submissions_exam_id_not_null NOT NULL exam_id,
	CONSTRAINT submissions_exam_id_student_id_question_id_key UNIQUE (exam_id, student_id, question_id),
	CONSTRAINT submissions_id_not_null NOT NULL id,
	CONSTRAINT submissions_pkey PRIMARY KEY (id),
	CONSTRAINT submissions_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'grading'::character varying, 'completed'::character varying, 'failed'::character varying])::text[]))),
	CONSTRAINT submissions_status_not_null NOT NULL status,
	CONSTRAINT submissions_student_id_not_null NOT NULL student_id,
	CONSTRAINT submissions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE,
	CONSTRAINT submissions_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE,
	CONSTRAINT submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE
);


-- public.exam_attempts definition

-- Drop table

-- DROP TABLE public.exam_attempts;

CREATE TABLE public.exam_attempts (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	exam_id uuid NOT NULL,
	student_id uuid NOT NULL,
	status varchar(50) NOT NULL,
	completed_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT exam_attempts_exam_id_not_null NOT NULL exam_id,
	CONSTRAINT exam_attempts_exam_id_student_id_key UNIQUE (exam_id, student_id),
	CONSTRAINT exam_attempts_id_not_null NOT NULL id,
	CONSTRAINT exam_attempts_pkey PRIMARY KEY (id),
	CONSTRAINT exam_attempts_status_not_null NOT NULL status,
	CONSTRAINT exam_attempts_student_id_not_null NOT NULL student_id,
	CONSTRAINT exam_attempts_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE,
	CONSTRAINT exam_attempts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE
);


-- public.grades definition

-- Drop table

-- DROP TABLE public.grades;

CREATE TABLE public.grades (
	id serial4 NOT NULL,
	submission_id uuid NULL,
	score numeric(5, 2) NULL,
	criteria_breakdown jsonb NULL,
	confidence numeric(5, 2) NULL,
	needs_review bool DEFAULT false NULL,
	instructor_feedback text NULL,
	student_feedback text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT grades_id_not_null NOT NULL id,
	CONSTRAINT grades_pkey PRIMARY KEY (id),
	CONSTRAINT grades_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE
);