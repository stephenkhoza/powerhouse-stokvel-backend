--
-- PostgreSQL database dump
--

\restrict CC8yeMQAZDB3eFL7oqigYhNO6zCBj6in7q8dTpTWvoX8h9oqL6kahFCIbnqcY1Y

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcements (
    id integer NOT NULL,
    title character varying(200) NOT NULL,
    message text NOT NULL,
    announcement_date date NOT NULL,
    priority character varying(20) DEFAULT 'normal'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.announcements OWNER TO postgres;

--
-- Name: announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.announcements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.announcements_id_seq OWNER TO postgres;

--
-- Name: announcements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.announcements_id_seq OWNED BY public.announcements.id;


--
-- Name: contributions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contributions (
    id integer NOT NULL,
    member_id character varying(20) NOT NULL,
    month character varying(20) NOT NULL,
    amount integer NOT NULL,
    status character varying(20) DEFAULT 'Pending'::character varying,
    payment_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.contributions OWNER TO postgres;

--
-- Name: contributions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.contributions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.contributions_id_seq OWNER TO postgres;

--
-- Name: contributions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.contributions_id_seq OWNED BY public.contributions.id;


--
-- Name: members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.members (
    id character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    id_number character varying(13) NOT NULL,
    phone character varying(20),
    email character varying(100) NOT NULL,
    password character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'Active'::character varying,
    role character varying(20) DEFAULT 'member'::character varying,
    join_date date,
    bank_name character varying(50),
    account_holder character varying(100),
    account_number character varying(20),
    branch_code character varying(10),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.members OWNER TO postgres;

--
-- Name: announcements id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements ALTER COLUMN id SET DEFAULT nextval('public.announcements_id_seq'::regclass);


--
-- Name: contributions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributions ALTER COLUMN id SET DEFAULT nextval('public.contributions_id_seq'::regclass);


--
-- Data for Name: announcements; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.announcements (id, title, message, announcement_date, priority, created_at, updated_at) FROM stdin;
1	Monthly Meeting - January 2026	Our next meeting is scheduled for Saturday, 18 January 2026 at 10:00 AM at the community hall.	2026-01-08	high	2026-01-08 10:43:50.834719	2026-01-08 10:43:50.834719
2	January Contributions Due	Please ensure your R500 contribution is paid by 15 January 2026.	2026-01-08	normal	2026-01-08 10:43:50.83642	2026-01-08 10:43:50.83642
\.


--
-- Data for Name: contributions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contributions (id, member_id, month, amount, status, payment_date, created_at, updated_at) FROM stdin;
1	PHSC2601001	January 2026	500	Paid	2026-01-05	2026-01-08 10:43:50.82613	2026-01-08 10:43:50.82613
2	PHSC2601002	January 2026	500	Paid	2026-01-06	2026-01-08 10:43:50.829483	2026-01-08 10:43:50.829483
3	PHSC2601003	January 2026	500	Pending	\N	2026-01-08 10:43:50.830485	2026-01-08 10:43:50.830485
5	PHSC2601002	December 2025	500	Paid	2025-12-04	2026-01-08 10:43:50.832529	2026-01-08 10:43:50.832529
6	PHSC2601003	December 2025	500	Paid	2026-01-08	2026-01-08 10:43:50.8336	2026-01-08 13:13:26.388298
4	PHSC2601001	December 2025	500	Pending	\N	2026-01-08 10:43:50.83155	2026-01-08 14:04:25.772509
7	PHSC2601004	January 2026	300	Pending	\N	2026-01-08 15:06:52.315415	2026-01-08 15:07:55.745877
\.


--
-- Data for Name: members; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.members (id, name, id_number, phone, email, password, status, role, join_date, bank_name, account_holder, account_number, branch_code, created_at, updated_at) FROM stdin;
PHSC2601001	Thabo Mokoena	8501155123089	083 123 4567	thabo@example.com	$2b$10$bYkDfLyHARBP9Z7b3udEQOkQJ1fv1EEH2OUVYPldCRsL28iau5yBi	Active	admin	2026-01-01	FNB	Thabo Mokoena	62851234890	250655	2026-01-08 10:43:50.819449	2026-01-08 10:43:50.819449
PHSC2601002	Zanele Ndlovu	9203128567089	082 234 5678	zanele@example.com	$2b$10$pGmNiJdnKWhzYX5lHpT8zeH7pheZ1eczOE77CmnqoYNNu88I3Agjy	Active	member	2026-01-01	Standard Bank	Zanele Ndlovu	410789234	051001	2026-01-08 10:43:50.824479	2026-01-08 10:43:50.824479
PHSC2601003	Sipho Dlamini	8807122345089	071 345 6789	sipho@example.com	$2b$10$pGmNiJdnKWhzYX5lHpT8zeH7pheZ1eczOE77CmnqoYNNu88I3Agjy	Active	member	2026-01-01	Capitec	Sipho Dlamini	1498765567	470010	2026-01-08 10:43:50.825332	2026-01-08 10:43:50.825332
PHSC2601004	Stephen Elson Khoza	9306216174088	0735270565	stentech08@gmail.com	$2b$10$EnoNJ1ZGUdCe49S8pMIjPO1ahlJlAb9NDXZoSLkOfKilA9ODFvZYS	Active	admin	2026-01-08					2026-01-08 15:04:12.91364	2026-01-08 15:04:12.91364
\.


--
-- Name: announcements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.announcements_id_seq', 2, true);


--
-- Name: contributions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.contributions_id_seq', 7, true);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: contributions contributions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_pkey PRIMARY KEY (id);


--
-- Name: members members_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_email_key UNIQUE (email);


--
-- Name: members members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.members
    ADD CONSTRAINT members_pkey PRIMARY KEY (id);


--
-- Name: contributions contributions_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contributions
    ADD CONSTRAINT contributions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict CC8yeMQAZDB3eFL7oqigYhNO6zCBj6in7q8dTpTWvoX8h9oqL6kahFCIbnqcY1Y

