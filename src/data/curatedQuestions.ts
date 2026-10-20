export interface CompleteWordsTask {
  id: string;
  title: string;
  level: string;
  topic: string;
  text: string;
  totalBlanks: number;
}

export interface ReadingQuestion {
  q: string;
  options: string[];
  answer: number;
  why: string;
}

export interface ReadingPassageTask {
  id: string;
  title: string;
  level: string;
  topic: string;
  passage: string;
  questions: ReadingQuestion[];
}

export interface ListeningTask {
  id: string;
  title: string;
  level: string;
  topic: string;
  context: string;
  speakers: { A: string; B: string };
  speakerVoices?: { A: 'Puck' | 'Kore' | 'Fenrir' | 'Zephyr'; B: 'Puck' | 'Kore' | 'Fenrir' | 'Zephyr' };
  speakerGenders?: { A: string; B: string };
  script: string;
  questions: ReadingQuestion[];
  audioUrl?: string | null;
  audioClips?: Array<{ speaker: string; url: string }> | null;
  questionDocId?: string;
}

export interface ListenRepeatTask {
  id: string;
  title: string;
  level: string;
  topic: string;
  sentences: string[];
  speakerName: string;
  speakerGender: 'male' | 'female' | 'unknown';
  audioUrl?: string | null;
  audioClips?: Array<{ speaker: string; url: string }> | null;
  questionDocId?: string;
}

export interface InterviewQuestionItem {
  question: string;
  prepTimeSeconds: number;
  responseTimeSeconds: number;
  suggestedPoints: string[];
}

export interface SpeakingInterviewTask {
  id: string;
  title: string;
  level: string;
  topic: string;
  context: string;
  questions: InterviewQuestionItem[];
  interviewerName: string;
  interviewerGender: 'male' | 'female' | 'unknown';
}

export interface BuildSentenceItem {
  context: string;
  words: string[];
  answer: string;
  explanation: string;
}

export interface BuildSentenceTask {
  id: string;
  title: string;
  level: string;
  topic: string;
  items: BuildSentenceItem[];
}

export interface WriteEmailTask {
  id: string;
  title: string;
  level: string;
  topic: string;
  situation: string;
  recipient: string;
  goals: string[];
  suggestedWordCount: string;
}

export interface AcademicDiscussionTask {
  id: string;
  title: string;
  level: string;
  topic: string;
  professorName: string;
  professorPrompt: string;
  s1: { name: string; text: string };
  s2: { name: string; text: string };
  question: string;
}

export const CURATED_COMPLETE_WORDS: CompleteWordsTask[] = [
  {
    id: 'cw-1',
    title: 'Synaptic Plasticity and Long-Term Memory',
    level: 'upper-intermediate',
    topic: 'science-tech',
    text: 'Synaptic plasticity is the biological foundation of human learning. Neuroscien[[tists]] have discov[[ered]] that syna[[pses]] strengthen throu[[gh]] repeated elect[[rical]] stimulation. This phenom[[enon]], known as long-term potentiation, ena[[bles]] neurons to st[[ore]] vast quant[[ities]] of infor[[mation]] across distributed cerebral circuits.',
    totalBlanks: 10,
  },
  {
    id: 'cw-2',
    title: 'Urban Heat Islands and Microclimate Mitigation',
    level: 'intermediate',
    topic: 'environment',
    text: 'Metropolitan areas frequently experience elevated temperatures relative to surrounding rural zones. This pat[[tern]] occurs beca[[use]] concrete struc[[tures]] absorb solar radi[[ation]] during the day. Enviro[[nmental]] planners advo[[cate]] installing refl[[ective]] roofs and expan[[ding]] urban cano[[pies]] to miti[[gate]] excessive heat stress.',
    totalBlanks: 10,
  },
  {
    id: 'cw-3',
    title: 'Algorithmic Pricing in Competitive Markets',
    level: 'advanced',
    topic: 'business-economics',
    text: 'Modern digital retailers increasingly rely upon automated dynamic pricing models. Soft[[ware]] algorithms moni[[tor]] competitor rates and pred[[ict]] consumer dem[[and]] in real time. While this stra[[tegy]] maximizes prof[[its]], regulatory agen[[cies]] express conc[[ern]] regarding taci[[t]] collusion among rival market part[[icipants]].',
    totalBlanks: 10,
  },
  {
    id: 'cw-4',
    title: 'Glacial Dynamics and Permafrost Thawing',
    level: 'upper-intermediate',
    topic: 'environment',
    text: 'Alpine glaciers serve as crucial hydrological reservoirs for downstream ecosystems. Rising glo[[bal]] temperatures acceler[[ate]] seasonal melt[[ing]], reducing sum[[mer]] streamflow in agricult[[ural]] valleys. Simultaneously, thaw[[ing]] subterranean perma[[frost]] destabil[[izes]] mountain slopes, increa[[sing]] the frequ[[ency]] of catastrophic rockfall hazards.',
    totalBlanks: 10,
  },
  {
    id: 'cw-5',
    title: 'Behavioral Economics and Choice Architecture',
    level: 'advanced',
    topic: 'social-sciences',
    text: 'Classical economic theory assumes consumers make completely rational choices. However, behav[[ioral]] economists dem[[onstrate]] that cogni[[tive]] biases systema[[tically]] distort decis[[ion]] making. By modif[[ying]] the cho[[ice]] architecture, institu[[tions]] can gently nud[[ge]] citizens toward pref[[erable]] retirement savings outcomes.',
    totalBlanks: 10,
  },
];

export const CURATED_READING_PASSAGES: ReadingPassageTask[] = [
  {
    id: 'rp-1',
    title: 'Echolocation in Marine Mammals',
    level: 'upper-intermediate',
    topic: 'science-tech',
    passage:
      'Odontocetes, or toothed whales, navigate and hunt in turbid waters using sophisticated bio-sonar known as echolocation. By contracting muscle plugs around their nasal passages, these cetaceans emit rapid acoustic clicks that pass through the melon—a lipid-rich organ located in the forehead that acts as an acoustic lens. The sound waves propagate through the water column until they strike an object, reflecting back toward the animal. The echoes are received not through external ear canals, which are vestigial, but through specialized acoustic fat channels within the lower jawbone that conduct vibrations directly to the middle and inner ear. This extraordinary sensory adaptation allows dolphins and sperm whales to ascertain the exact range, speed, shape, and internal density of prey in environments where ambient light cannot penetrate.',
    questions: [
      {
        q: 'What is the primary function of the melon described in the passage?',
        options: [
          'It generates the muscular contractions needed for nasal sounds.',
          'It acts as an acoustic lens focusing emitted sound waves.',
          'It receives acoustic echoes through the lower jawbone.',
          'It protects the brain cavity from deep oceanic pressures.',
        ],
        answer: 1,
        why: 'The passage explicitly states that acoustic clicks pass through the melon, "which acts as an acoustic lens."',
      },
      {
        q: 'According to the passage, how do toothed whales receive acoustic echoes?',
        options: [
          'Through highly developed external ear canals.',
          'Through sensitive tactile receptors along their dorsal fin.',
          'Through specialized fat pads within the lower jawbone.',
          'Through the resonant cavity of the melon.',
        ],
        answer: 2,
        why: 'The text notes that echoes are received through "specialized acoustic fat channels within the lower jawbone that conduct vibrations directly to the middle and inner ear."',
      },
      {
        q: 'The word "vestigial" in the passage is closest in meaning to:',
        options: ['Vital and essential', 'Rudimentary and nonfunctional', 'Highly sensitive', 'Acoustically tuned'],
        answer: 1,
        why: '"Vestigial" describes an organ or structure that has lost its ancestral function through evolutionary divergence, functioning here as rudimentary or obsolete.',
      },
    ],
  },
  {
    id: 'rp-2',
    title: 'The Industrial Decarbonization Dilemma',
    level: 'advanced',
    topic: 'environment',
    passage:
      'Heavy industries such as steelmaking, cement production, and chemical synthesis account for nearly a third of global greenhouse gas emissions. Unlike light passenger transportation, which can transition relatively smoothly to lithium-ion electrification, heavy industrial processes require high-grade thermal heat exceeding 1,000 degrees Celsius, temperatures difficult to attain economically via standard electric resistive heating. Furthermore, chemical reactions inherent to cement calcination release carbon dioxide as an unavoidable stoichiometric byproduct, independent of fuel choice. Consequently, deep decarbonization in these "hard-to-abate" sectors necessitates a multipronged technological portfolio: green hydrogen derived from water electrolysis for blast furnace reduction, point-source carbon capture and geological sequestration (CCS), and the development of alternative pozzolanic binders.',
    questions: [
      {
        q: 'Why is heavy industrial decarbonization more challenging than passenger vehicle electrification?',
        options: [
          'Heavy industries lack sufficient investment capital compared to automakers.',
          'High thermal temperature requirements and chemical reaction emissions cannot be solved by simple electrification.',
          'Carbon capture technology is completely ineffective in cement kilns.',
          'Governments currently exempt heavy manufacturing from emissions regulations.',
        ],
        answer: 1,
        why: 'The passage explains that heavy processes require intense thermal heat (>1000°C) and produce CO2 as an unavoidable stoichiometric byproduct.',
      },
      {
        q: 'The author mentions "pozzolanic binders" in order to:',
        options: [
          'Illustrate an alternative material to mitigate emissions in cement manufacturing.',
          'Demonstrate how steel blast furnaces utilize green hydrogen.',
          'Argue that carbon capture is technically obsolete.',
          'Criticize traditional geological sequestration projects.',
        ],
        answer: 0,
        why: 'The author lists alternative pozzolanic binders as part of the technological portfolio to substitute for clinker in cement production.',
      },
      {
        q: 'Which of the following can be inferred regarding green hydrogen in steelmaking?',
        options: [
          'It serves directly as an electrical storage medium in vehicles.',
          'It can substitute for metallurgical coal as a reducing agent in blast furnaces.',
          'It causes higher greenhouse gas emissions than coke.',
          'It is exclusively utilized to heat pozzolanic binders.',
        ],
        answer: 1,
        why: 'The passage specifies "green hydrogen derived from water electrolysis for blast furnace reduction" as a decarbonization solution.',
      },
    ],
  },
  {
    id: 'rp-3',
    title: 'The Flipped Classroom Pedagogical Paradigm',
    level: 'intermediate',
    topic: 'campus-life',
    passage:
      'The flipped classroom is an instructional strategy that reverses traditional educational dynamics by delivering didactic instructional content outside the classroom—frequently via pre-recorded video lectures—while moving homework and problem-solving activities into the physical classroom session. Proponents argue this inverted structure fosters higher student engagement because instructional contact hours are dedicated to active peer collaboration, dialectic inquiry, and direct instructor mentorship rather than passive listening. However, educational researchers note that the model relies heavily on autonomous student self-regulation; undergraduates who fail to complete foundational preparatory viewings struggle to participate meaningfully in synchronous discussions, exacerbating achievement divides between highly self-directed and less disciplined cohorts.',
    questions: [
      {
        q: 'What is the core premise of the flipped classroom model?',
        options: [
          'Traditional lectures are delivered outside class so that in-person time is reserved for interactive collaborative activities.',
          'Examinations are eliminated in favor of independent term papers.',
          'Instructors no longer interact directly with undergraduate students.',
          'Students are assigned double the traditional amount of textbook readings.',
        ],
        answer: 0,
        why: 'The passage defines the model as delivering instructional lectures outside class while moving problem-solving into class sessions.',
      },
      {
        q: 'What main limitation of the flipped classroom does the author identify?',
        options: [
          'Pre-recorded videos are prohibitively expensive to produce.',
          'Success depends on independent student preparation, potentially widening achievement gaps.',
          'University accreditors generally forbid asynchronous video lectures.',
          'Instructors receive lower course evaluation ratings.',
        ],
        answer: 1,
        why: 'The author explicitly explains that the model requires self-regulation, and unprepared students struggle, exacerbating achievement divides.',
      },
      {
        q: 'The word "didactic" in the passage is closest in meaning to:',
        options: ['Instructional and informative', 'Entertaining and playful', 'Experimental and unproven', 'Controversial'],
        answer: 0,
        why: '"Didactic" refers to material intended to instruct, convey information, or teach a lesson.',
      },
    ],
  },
];

export const CURATED_LISTENING: ListeningTask[] = [
  {
    id: 'lis-1',
    title: 'Undergraduate Research Assistantship Application',
    level: 'intermediate',
    topic: 'campus-life',
    context: 'A student visits Professor Alvarez during office hours to inquire about an undergraduate research assistant opening in her biochemistry laboratory.',
    speakers: {
      A: 'Student (Marcus)',
      B: 'Professor Alvarez',
    },
    speakerGenders: {
      A: 'male',
      B: 'female',
    },
    script: `Speaker A: Good afternoon, Professor Alvarez. Do you have a few minutes? I saw the flyer posted outside the department office regarding the undergraduate research position in your biochemistry lab.
Speaker B: Hello Marcus! Yes, certainly, take a seat. We are expanding our investigations into enzyme kinetics this term, specifically isolating recombinant alkaline phosphatase from bacterial cultures.
Speaker A: That aligns perfectly with what I hope to study in graduate school. I took Biochemistry 301 last semester with an A-, and our lab sections covered spectrophotometric assays and SDS-PAGE gel electrophoresis.
Speaker B: Having practical bench experience with gel electrophoresis is definitely advantageous. In this role, however, you would also be responsible for early-morning bacterial cell harvesting, high-speed centrifugation, and preparing Bradford protein assays before our graduate researchers begin their kinetic runs.
Speaker A: I am very comfortable with pipetting and quantitative assays, and I understand the precision required when balancing centrifuge rotors.
Speaker B: That is reassuring to hear. Now, the position requires ten hours per week, primarily on Tuesday and Thursday mornings starting at 7:30 AM. Would that conflict with your lecture schedule?
Speaker A: Not at all. My Tuesday and Thursday lectures don't begin until 11:00 AM in the science building next door, so arriving by 7:30 fits my schedule well.
Speaker B: Excellent. There is one additional administrative requirement. Our project works with genetically modified bacterial strains, which means university safety regulations require all laboratory personnel to hold active Biosafety Level 2 certification. Have you completed that module through Environmental Health and Safety?
Speaker A: In my introductory biology course, we only completed the Level 1 general hazard training. Does the Level 2 certification take a long time to obtain?
Speaker B: Not at all. It is a two-hour self-paced online module available through the campus EHS portal. If you can complete the module over the weekend, you will be cleared for wet-lab orientation by Monday.
Speaker A: That sounds completely manageable. I will log onto the portal tonight and finish the modules.
Speaker B: Great. Please email me your unofficial transcript, a brief summary of your prior lab techniques, and your Biosafety Level 2 certificate of completion by Friday afternoon. Once I review those, we can schedule your safety walkthrough.`,
    questions: [
      {
        q: 'Why does Marcus visit Professor Alvarez during office hours?',
        options: [
          'To request an extension on his Biochemistry 301 research paper.',
          'To apply for an open undergraduate research assistant position in her laboratory.',
          'To ask for a letter of recommendation for graduate school admission.',
          'To dispute a grade he received on a protein purification exam.',
        ],
        answer: 1,
        why: 'Marcus states at the beginning that he saw the posted flyer and wants to inquire about the undergraduate research assistant position.',
      },
      {
        q: 'What laboratory duty will Marcus be expected to perform in the mornings?',
        options: [
          'Synthesizing synthetic DNA sequences from chemical precursors.',
          'Harvesting bacterial cells, running centrifuges, and setting up Bradford protein assays.',
          'Grading introductory biology laboratory notebooks for underclassmen.',
          'Calibrating electron microscopes for graduate researchers.',
        ],
        answer: 1,
        why: 'Professor Alvarez specifies that he would be responsible for "early-morning bacterial cell harvesting, high-speed centrifugation, and preparing Bradford protein assays."',
      },
      {
        q: 'Why does Professor Alvarez mention Biosafety Level 2 certification?',
        options: [
          'Because the university requires it for all students enrolling in Biochemistry 301.',
          'Because Marcus received an incomplete grade in laboratory safety.',
          'Because the research involves genetically modified bacterial strains that require specific safety compliance.',
          'Because the campus EHS portal will be shutting down at the end of the term.',
        ],
        answer: 2,
        why: 'Professor Alvarez clarifies that because the project works with "genetically modified bacterial strains," university regulations mandate active Biosafety Level 2 certification.',
      },
      {
        q: 'What can be inferred about Marcus’s qualification for the position?',
        options: [
          'He has never performed laboratory work before applying.',
          'His strong academic record in Biochemistry 301 and familiarity with gel electrophoresis make him a viable candidate.',
          'He cannot meet the morning time commitment due to overlapping lectures.',
          'He has already completed all graduate-level research certifications.',
        ],
        answer: 1,
        why: 'Professor Alvarez notes that his A- in Biochemistry 301 and previous experience with spectrophotometry and gel electrophoresis are definite advantages.',
      },
      {
        q: 'What three items must Marcus submit by Friday afternoon?',
        options: [
          'His formal diploma, tuition receipt, and financial aid application.',
          'His unofficial transcript, a summary of lab techniques, and the Biosafety Level 2 completion certificate.',
          'A faculty recommendation letter, a published manuscript, and a syllabus.',
          'A revised course schedule signed by his major advisor.',
        ],
        answer: 1,
        why: 'At the end of the conversation, Professor Alvarez instructs him to email his "unofficial transcript, a brief summary of your prior lab techniques, and your Biosafety Level 2 certificate of completion by Friday afternoon."',
      },
    ],
  },
  {
    id: 'lis-2',
    title: 'Geology Lecture: Caldera Formation',
    level: 'upper-intermediate',
    topic: 'science-tech',
    context: 'An excerpt from an introductory Earth Sciences lecture discussing volcanic calderas.',
    speakers: {
      A: 'Professor Vance (Lecturer)',
      B: 'Student Question',
    },
    speakerGenders: {
      A: 'male',
      B: 'female',
    },
    script: `Speaker A: Today we will distinguish volcanic craters from calderas. While a crater is created by the explosive excavation of rock during an eruption, a caldera forms by structural collapse.
Speaker B: Professor, does that mean a caldera is basically a crater that has caved in?
Speaker A: In a sense, yes, but the scale and mechanism differ fundamentally. When a massive magma chamber empties rapidly during an explosive super-eruption, the unsupported roof above the reservoir can no longer withstand the immense weight of the overlying volcanic edifice.
Speaker A: Consequently, the entire summit collapses inward along ring-shaped fractures. The resulting basin can span tens of kilometers in diameter, as seen in Crater Lake in Oregon or Yellowstone. Over thousands of years, these calderas often fill with rainwater, forming pristine crater lakes, or experience renewed resurgent doming from rising magma below.`,
    questions: [
      {
        q: 'What is the fundamental difference between a crater and a caldera according to the lecturer?',
        options: [
          'Craters are formed by water erosion, whereas calderas are created by wind.',
          'Craters are formed by explosive excavation, while calderas result from structural roof collapse.',
          'Calderas only occur in oceanic trenches, whereas craters occur on land.',
          'Calderas are much smaller than traditional volcanic craters.',
        ],
        answer: 1,
        why: 'The lecturer highlights that "a crater is created by explosive excavation of rock... while a caldera forms by structural collapse."',
      },
      {
        q: 'Why does the summit of a volcano collapse into the magma chamber?',
        options: [
          'Heavy rainfall increases the weight beyond the rock threshold.',
          'Rapid evacuation of magma leaves the overlying volcanic edifice unsupported.',
          'Tectonic plates collide directly beneath the crater rim.',
          'Resurgent domes exert downward pressure on the chamber.',
        ],
        answer: 1,
        why: 'When the magma chamber empties rapidly, "the unsupported roof above the reservoir can no longer withstand the immense weight of the overlying volcanic edifice."',
      },
      {
        q: 'What example does the professor provide of a caldera filled with water?',
        options: ['Mount St. Helens', 'Crater Lake in Oregon', 'Mauna Loa in Hawaii', 'Mount Vesuvius in Italy'],
        answer: 1,
        why: 'The professor cites "Crater Lake in Oregon or Yellowstone" as prominent examples of calderas.',
      },
    ],
  },
  {
    id: 'lis-3',
    title: 'Academic Advising: Course Prerequisite Waiver',
    level: 'intermediate',
    topic: 'campus-life',
    context: 'A student speaks with an academic advisor regarding registration for an advanced genetics course.',
    speakers: {
      A: 'Student (Chloe)',
      B: 'Academic Advisor (Dr. Campbell)',
    },
    speakerGenders: {
      A: 'female',
      B: 'male',
    },
    script: `Speaker A: Dr. Campbell, thank you for meeting with me. The registration portal blocked me from enrolling in Advanced Molecular Genetics 410 because I haven't taken Organic Chemistry Lab II.
Speaker B: Yes, Chloe, that lab is listed as a mandatory prerequisite to ensure students are familiar with chromatography techniques before working with recombinant DNA.
Speaker A: I understand, but I actually performed extensive column chromatography during my summer internship at the State Agricultural Biotechnology Institute. Here is the formal verification letter from my research supervisor.
Speaker B: Oh, that is impressive! Working in a professional research facility often provides more hands-on bench experience than our undergraduate teaching labs.
Speaker B: If Professor Martinez, who teaches the lecture, signs this departmental waiver form, I can override the prerequisite lock in the registrar's system today.
Speaker A: Wonderful! Professor Martinez has office hours this afternoon, so I will take the waiver form directly to her office.`,
    questions: [
      {
        q: 'Why was Chloe unable to enroll in Advanced Molecular Genetics?',
        options: [
          'The course reached maximum enrollment capacity.',
          'She had not satisfied the Organic Chemistry Lab II prerequisite.',
          'Her academic transcript had not been submitted to the university.',
          'She missed the initial course registration deadline.',
        ],
        answer: 1,
        why: 'The registration system blocked her because she had not completed the required Organic Chemistry Lab II prerequisite.',
      },
      {
        q: 'How does Chloe demonstrate that she already possesses the required lab skills?',
        options: [
          'She shows an official verification letter from her biotechnology summer internship.',
          'She passes a credit-by-exam test administered by Dr. Campbell.',
          'She presents a letter of recommendation from high school.',
          'She agrees to co-author a paper with Professor Martinez.',
        ],
        answer: 0,
        why: 'Chloe explains that she performed column chromatography during her summer internship and provides a formal verification letter from her supervisor.',
      },
      {
        q: 'What must Chloe do before Dr. Campbell can override the registration system?',
        options: [
          'Pay an administrative late registration fee.',
          'Obtain Professor Martinez’s signature on the departmental waiver form.',
          'Complete an online safety orientation module.',
          'Submit a petition to the academic dean.',
        ],
        answer: 1,
        why: 'Dr. Campbell states that if Professor Martinez signs the departmental waiver form, he can override the lock.',
      },
    ],
  },
];

export const CURATED_LISTEN_REPEAT: ListenRepeatTask[] = [
  {
    id: 'lr-1',
    title: 'Academic Life & Campus Communication',
    level: 'intermediate',
    topic: 'campus-life',
    speakerName: 'Sarah',
    speakerGender: 'female',
    sentences: [
      "The seminar begins at ten o'clock tomorrow.",
      'Students must submit their laboratory reports before Friday afternoon.',
      'The university library will remain open throughout the entire midterm examination period.',
      'Professors usually recommend reviewing lecture slides thoroughly before participating in discussion sessions.',
      'Attending weekly office hours allows undergraduates to clarify complicated theoretical concepts with teaching assistants.',
    ],
  },
  {
    id: 'lr-2',
    title: 'Scientific Research & Technology',
    level: 'upper-intermediate',
    topic: 'science-tech',
    speakerName: 'Marcus',
    speakerGender: 'male',
    sentences: [
      'Solar panels convert sunlight directly into clean electricity.',
      'Recent clinical trials demonstrated remarkable improvements in cognitive memory retention.',
      'Researchers discovered that marine organisms migrate toward deeper oceanic layers during seasonal warming.',
      'Artificial intelligence systems require extensive training datasets to achieve reliable predictive accuracy across diverse scenarios.',
      'The engineering department recently unveiled an innovative water filtration mechanism designed specifically for remote agricultural communities.',
    ],
  },
];

export const CURATED_SPEAKING_INTERVIEWS: SpeakingInterviewTask[] = [
  {
    id: 'si-1',
    title: 'University Life & Study Habits',
    level: 'intermediate',
    topic: 'campus-life',
    interviewerName: 'Professor Lee',
    interviewerGender: 'female',
    context: 'You are participating in an academic interview regarding university study environments and campus choices.',
    questions: [
      {
        question: 'Do you prefer studying alone in a quiet space or collaborating with peers in a study group? Why?',
        prepTimeSeconds: 15,
        responseTimeSeconds: 45,
        suggestedPoints: [
          'State clear preference (solitary vs group study)',
          'Provide specific reasons (concentration, diverse viewpoints, accountability)',
          'Give a concrete personal example from your academic experience',
        ],
      },
      {
        question: 'How do you prioritize your time when you have multiple academic deadlines approaching in the same week?',
        prepTimeSeconds: 20,
        responseTimeSeconds: 45,
        suggestedPoints: [
          'Mention organizational strategies (digital calendars, priority matrices, breaking down tasks)',
          'Discuss how you manage stress and maintain consistency',
          'Explain the outcome of applying this strategy',
        ],
      },
      {
        question: 'Some universities are replacing traditional paper textbooks entirely with digital e-books. Do you think this is a beneficial policy?',
        prepTimeSeconds: 20,
        responseTimeSeconds: 50,
        suggestedPoints: [
          'Evaluate pros (cost reduction, searchability, environmental impact) and cons (screen fatigue, distraction)',
          'Take a balanced stance and offer a reasoned conclusion',
          'Highlight impact on student equity',
        ],
      },
      {
        question: 'If you could introduce one new facility or service on your university campus to improve student well-being, what would it be and why?',
        prepTimeSeconds: 25,
        responseTimeSeconds: 60,
        suggestedPoints: [
          'Propose a specific facility (wellness/meditation center, 24/7 maker space, peer tutoring hub)',
          'Justify its necessity with current campus challenges',
          'Detail the long-term benefits to the university community',
        ],
      },
    ],
  },
];

export const CURATED_BUILD_SENTENCES: BuildSentenceTask[] = [
  {
    id: 'bs-1',
    title: 'Academic Syntax & Inversions',
    level: 'upper-intermediate',
    topic: 'science-tech',
    items: [
      {
        context: 'What did the environmental researchers observe in the coastal wetlands?',
        words: ['did', 'the scientists', 'observe', 'rarely', 'such rapid', 'habitat loss'],
        answer: 'Rarely did the scientists observe such rapid habitat loss.',
        explanation: 'Negative inversion: When a sentence begins with a negative adverbial like "Rarely", subject-auxiliary inversion is required ("did the scientists observe").',
      },
      {
        context: 'Why is peer review considered essential in scholarly publishing?',
        words: ['it ensures', 'that only', 'rigorous methodologies', 'are accepted', 'for publication'],
        answer: 'It ensures that only rigorous methodologies are accepted for publication.',
        explanation: 'Noun clause with passive voice: "It ensures that [noun clause: subject + passive verb + prepositional phrase]".',
      },
      {
        context: 'How does high inflation affect everyday consumer spending habits?',
        words: ['consumers tend to', 'reduce their', 'discretionary purchases', 'significantly'],
        answer: 'Consumers tend to reduce their discretionary purchases significantly.',
        explanation: 'Subject + verb phrase + object + adverb: "Consumers tend to reduce [object] [adverb]".',
      },
      {
        context: 'What happened after the university modernized its digital library system?',
        words: ['not only did', 'usage increase', 'but student', 'satisfaction also', 'improved'],
        answer: 'Not only did usage increase but student satisfaction also improved.',
        explanation: 'Correlative conjunction with inversion: "Not only did [subject] [verb], but [subject] also [verb]".',
      },
      {
        context: 'Why was the chemical synthesis experiment conducted under strict temperature controls?',
        words: ['had the temperature', 'fluctuated', 'the delicate compounds', 'would have broken down'],
        answer: 'Had the temperature fluctuated the delicate compounds would have broken down.',
        explanation: 'Inverted third conditional: "Had + subject + past participle" replaces "If the temperature had fluctuated".',
      },
    ],
  },
];

export const CURATED_WRITE_EMAILS: WriteEmailTask[] = [
  {
    id: 'we-1',
    title: 'Requesting an Extension for an Independent Research Paper',
    level: 'upper-intermediate',
    topic: 'campus-life',
    situation:
      'You are enrolled in an advanced seminar with Professor Hawthorne. Due to an unexpected equipment malfunction in the campus microbiology lab last weekend, your experimental data collection was delayed by four days. The final research paper is due this coming Friday.',
    recipient: 'Professor Hawthorne (Course Instructor)',
    goals: [
      'Politely inform the professor about the lab equipment breakdown and apologize for the disruption.',
      'Explain how much of the research and draft you have already completed.',
      'Propose a specific revised submission deadline (e.g., following Tuesday) and ask if you can meet briefly during office hours.',
    ],
    suggestedWordCount: '90-120 words',
  },
  {
    id: 'we-2',
    title: 'Inquiring About an On-Campus Sustainability Internship',
    level: 'intermediate',
    topic: 'environment',
    situation:
      'The University Office of Sustainability recently announced an opening for a Student Campus Composting Coordinator. You are interested in applying, but the application portal has ambiguous information regarding weekly hour commitments and whether students with lab courses are eligible.',
    recipient: 'Ms. Elena Rostova (Campus Sustainability Director)',
    goals: [
      'State your interest in the Composting Coordinator position and briefly mention your relevant background.',
      'Ask for clarification regarding the weekly time commitment and scheduling flexibility.',
      'Politely inquire about the deadline for submitting recommendation letters.',
    ],
    suggestedWordCount: '80-110 words',
  },
];

export const CURATED_ACADEMIC_DISCUSSIONS: AcademicDiscussionTask[] = [
  {
    id: 'ad-1',
    title: 'The Role of Artificial Intelligence in Higher Education',
    level: 'upper-intermediate',
    topic: 'science-tech',
    professorName: 'Professor Marcus Lindqvist',
    professorPrompt:
      'Many universities are debating how to incorporate generative artificial intelligence into academic coursework. Some educators argue that students should be prohibited from using AI writing tools because it undermines critical thinking and authentic skill acquisition. Others believe institutions should actively teach students how to collaborate with AI responsibly, as these tools will be indispensable in modern professional workplaces. In your post, express your perspective on this debate.',
    s1: {
      name: 'Claire',
      text: 'I think universities should restrict generative AI in foundational courses. If students rely on AI to formulate arguments or generate essays, they miss out on developing essential analytical reasoning and independent prose skills.',
    },
    s2: {
      name: 'David',
      text: 'Banning AI is counterproductive because it will be standard in almost every career. Instructors should instead redesign assignments to test higher-order critique and prompt engineering rather than forbidding the technology.',
    },
    question:
      'In your response, express and support your personal opinion. Address the points raised by Claire or David, and contribute an original argument to the academic discussion. Write approximately 100 to 130 words.',
  },
  {
    id: 'ad-2',
    title: 'Remote Work vs. In-Person Office Culture',
    level: 'intermediate',
    topic: 'business-economics',
    professorName: 'Professor Sophia Henderson',
    professorPrompt:
      'Over the past several years, remote and hybrid employment models have become ubiquitous. Many corporate leaders contend that physical co-location in an office is indispensable for spontaneous creativity, team mentorship, and organizational culture. Conversely, numerous employees argue that telecommuting boosts productivity by eliminating arduous commutes and granting greater work-life autonomy. What is your opinion on which model creates greater long-term societal and economic value?',
    s1: {
      name: 'Tanya',
      text: 'Remote work provides undeniable benefits for work-life balance and environmental sustainability by drastically cutting vehicular emissions. Furthermore, workers can choose affordable living regions without sacrificing career prospects.',
    },
    s2: {
      name: 'Kenji',
      text: 'While remote work is convenient, spontaneous collaboration and accidental discoveries vanish when everyone sits behind screens. Young professionals also suffer because informal apprenticeship and peer bonding are much harder via video calls.',
    },
    question:
      'In your response, express and support your personal opinion. Address the arguments made by Tanya or Kenji, and contribute an original argument with supporting examples. Write approximately 100 to 130 words.',
  },
  {
    id: 'ad-3',
    title: 'Replacing Final Exams with Project-Based Assessment',
    level: 'upper-intermediate',
    topic: 'campus-life',
    professorName: 'Professor Rachel Tanaka',
    professorPrompt:
      'Our academic committee is evaluating whether traditional, high-stakes final examinations should be replaced by comprehensive, collaborative project-based evaluations across undergraduate courses. Proponents argue that multi-week projects develop authentic problem-solving, sustained research stamina, and teamwork essential for modern careers. Skeptics contend that written exams are indispensable for objectively verifying individual knowledge retention without group free-riding. What is your perspective on this pedagogical proposal?',
    s1: {
      name: 'Liam',
      text: 'Project-based assessments reflect how we actually work in professional fields. Timed exams simply measure memorization under stress rather than genuine comprehension and practical application of course concepts.',
    },
    s2: {
      name: 'Zoe',
      text: 'Final exams are necessary because they ensure individual accountability. In group projects, diligent students frequently end up doing all the work while disengaged peers unfairly receive identical grades.',
    },
    question:
      'In your response, express and support your personal opinion. Address the points raised by Liam or Zoe, and contribute an original argument to the academic discussion. Write approximately 100 to 130 words.',
  },
  {
    id: 'ad-4',
    title: 'Mandatory Critical Thinking Courses for First-Year Students',
    level: 'advanced',
    topic: 'social-sciences',
    professorName: 'Professor Eric Morales',
    professorPrompt:
      'Several universities are considering instituting a mandatory semester-long course in logic and critical thinking for all incoming freshmen, regardless of their intended major. Proponents claim that in an era saturated with algorithmic misinformation and polarizing digital media, evaluating evidence objectively is a foundational democratic competence. Opponents argue that requiring another general education course restricts students’ freedom to explore specialized electives in their primary fields. Do you support making critical thinking mandatory?',
    s1: {
      name: 'Sarah',
      text: 'A critical thinking course should definitely be mandatory. In the era of viral misinformation and deepfakes, learning how to evaluate sources and dissect flawed arguments is more vital than almost any single disciplinary elective.',
    },
    s2: {
      name: 'Carlos',
      text: 'While critical thinking is important, it should be taught within existing discipline-specific courses like biology or history. Forcing a standalone requirement unnecessarily burdens students with extra tuition and reduces scheduling flexibility.',
    },
    question:
      'In your response, express and support your personal opinion. Address the arguments made by Sarah or Carlos, and contribute an original argument with supporting examples. Write approximately 100 to 130 words.',
  },
  {
    id: 'ad-5',
    title: 'Taking Temporary Breaks from Digital Technology',
    level: 'intermediate',
    topic: 'science-tech',
    professorName: 'Professor Jordan Hayes',
    professorPrompt:
      'Many health researchers recommend that individuals periodically take scheduled "digital detoxes"—completely disconnecting from smartphones, social media, and digital devices for several days. Proponents argue that stepping away from constant notifications reduces chronic stress, restores natural attention spans, and revitalizes face-to-face interpersonal relationships. Skeptics, however, contend that modern professional and academic life requires continuous connectivity, and that artificial disconnection only induces communication anxiety and causes work to pile up. Do you think temporary breaks from technology are truly beneficial?',
    s1: {
      name: 'Marcus',
      text: 'Taking intentional breaks from technology is essential for mental wellness. Constantly checking social feeds fractures our focus and increases burnout. A weekend offline allows our minds to reset and improves genuine creativity.',
    },
    s2: {
      name: 'Nina',
      text: 'Completely unplugging is unrealistic and counterproductive. Falling behind on university announcements or urgent team messages creates more anxiety than it relieves. It is far better to cultivate healthy daily boundaries than to stage artificial retreats.',
    },
    question:
      'In your response, express and support your personal opinion. Address the arguments raised by Marcus or Nina, and contribute an original perspective with concrete examples. Write approximately 100 to 130 words.',
  },
];
