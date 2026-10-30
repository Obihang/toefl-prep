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
  audioExcerpt?: string;
  questionType?: string;
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
  id?: string;
  question: string;
  prepTimeSeconds: number;
  responseTimeSeconds: number;
  suggestedPoints: string[];
  sampleAnswer?: string;
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
  sampleAnswer?: string;
  modelAnswers?: string[];
}

export interface BuildSentenceItem {
  id?: string;
  context: string;
  framePrefix?: string;
  frameSuffix?: string;
  targetChunks: string[];
  distractorChunks?: string[];
  words: string[];
  scrambledWords?: string[];
  targetSentence: string;
  answer: string;
  correctSentence?: string;
  grammarRule?: string;
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
    text: 'Synaptic plasticity is the biological foundation of human learning and memory retention. Neuroscientists ha[ve] discovered th[at] synapses grad[ually] strengthen thr[ough] repeated elect[rical] stimulation. Th[is] phenomenon dire[ctly] enables cort[ical] neurons t[o] store va[st] quantities of complex information across cerebral circuits. As neural pathways consolidate during deep restorative sleep, newly acquired declarative knowledge transitions from temporary hippocampal storage into permanent neocortical networks.',
    totalBlanks: 10,
  },
  {
    id: 'cw-2',
    title: 'Urban Heat Islands and Microclimate Mitigation',
    level: 'intermediate',
    topic: 'environment',
    text: 'Metropolitan areas frequently experience elevated temperatures relative to surrounding rural zones. This pat[tern] occurs bec[ause] asphalt a[nd] concrete struc[tures] absorb int[ense] solar radi[ation] throughout t[he] afternoon. Muni[cipal] planners ther[efore] advocate inst[alling] reflective rooftops and expanding urban canopies to mitigate excessive heat stress. Dense neighborhood vegetation not only shades pedestrian walkways but also lowers ambient air temperatures through natural daytime leaf evapotranspiration.',
    totalBlanks: 10,
  },
  {
    id: 'cw-3',
    title: 'Algorithmic Pricing in Competitive Markets',
    level: 'advanced',
    topic: 'business-economics',
    text: 'Modern digital retailers increasingly rely upon automated dynamic pricing models. Software algor[ithms] continuously mon[itor] competitor ra[tes] and pre[dict] consumer dem[and] in re[al] time. Wh[ile] this stra[tegy] maximizes corp[orate] profits, regul[atory] agencies express concern regarding tacit collusion among rival market participants. When competing platforms deploy similar machine learning systems, retail prices can remain artificially elevated without any explicit human agreement.',
    totalBlanks: 10,
  },
  {
    id: 'cw-4',
    title: 'Glacial Dynamics and Permafrost Thawing',
    level: 'upper-intermediate',
    topic: 'environment',
    text: 'Alpine glaciers serve as crucial hydrological reservoirs for downstream ecosystems. Rising glo[bal] temperatures accel[erate] seasonal gla[cial] melting, stea[dily] reducing la[te] summer strea[mflow] across agricu[ltural] valleys. Simulta[neously], thawing subter[ranean] permafrost destab[ilizes] steep mountain slopes and increases the frequency of catastrophic rockfall hazards. Civil engineers in mountainous regions must continuously monitor ground temperatures and reinforce vulnerable transport corridors against sudden debris flows.',
    totalBlanks: 10,
  },
  {
    id: 'cw-5',
    title: 'Behavioral Economics and Choice Architecture',
    level: 'advanced',
    topic: 'social-sciences',
    text: 'Classical economic theory assumes consumers make completely rational choices. However, behav[ioral] economists consis[tently] demonstrate th[at] cognitive bia[ses] systematically dis[tort] human deci[sion] making. B[y] modifying t[he] underlying cho[ice] architecture, pub[lic] institutions can gently nudge citizens toward preferable retirement savings outcomes. Simple administrative adjustments, such as automatic enrollment in employer pension plans, dramatically increase long-term financial security without restricting individual freedom of choice.',
    totalBlanks: 10,
  },
  {
    id: 'cw-6',
    title: 'Bioluminescence in Abyssal Marine Ecosystems',
    level: 'upper-intermediate',
    topic: 'science-tech',
    text: 'In the pitch-black depths of the ocean, many marine organisms produce light through chemical bioluminescence. This rema[rkable] biological reac[tion] occurs wit[hin] specialized cell[ular] organs a[nd] helps de[ep] sea crea[tures] attract elu[sive] prey, sta[rtle] dangerous pred[ators], or communicate with potential mates. Molecular biologists now study these glowing proteins to develop advanced medical imaging tools that track cellular activity inside living tissues.',
    totalBlanks: 10,
  },
  {
    id: 'cw-7',
    title: 'Roman Marine Concrete Durability',
    level: 'advanced',
    topic: 'arts-humanities',
    text: 'Ancient Roman marine structures have survived relentless ocean waves for millennia while modern concrete deteriorates within decades. Recent minera[logical] analyses rev[eal] that anc[ient] builders mi[xed] volcanic a[sh] and quic[klime] with seaw[ater], triggering dur[able] crystal gro[wth] whenever micro[scopic] structural cracks formed. This self-healing mineral reaction automatically seals tiny fractures and inspires contemporary engineers to design far more sustainable coastal infrastructure today.',
    totalBlanks: 10,
  },
  {
    id: 'cw-8',
    title: 'Mycorrhizal Fungal Networks in Forests',
    level: 'advanced',
    topic: 'environment',
    text: 'Beneath the floor of every healthy forest lies a vast subterranean network of microscopic fungal threads called mycorrhizae. These symb[iotic] fungi colo[nize] the ro[ot] systems o[f] trees a[nd] exchange vi[tal] soil mine[rals] like phosp[horus] and nitr[ogen] for photosy[nthetic] carbon sugars. Through this underground web, mature forest trees can even transfer scarce nutrients and chemical warning signals to neighboring seedlings during droughts.',
    totalBlanks: 10,
  },
  {
    id: 'cw-9',
    title: 'Coral Reef Symbiosis and Thermal Bleaching',
    level: 'intermediate',
    topic: 'environment',
    text: 'Tropical coral reefs support roughly a quarter of all marine biodiversity despite covering less than one percent of oceans. Reef buil[ding] corals re[ly] upon micro[scopic] photosynthetic al[gae] living ins[ide] their tis[sues] to pro[vide] essential nutr[ients] and vib[rant] protective pigm[ents] throughout the year. When ocean temperatures rise abnormally, stressed corals expel these symbiotic algae, leaving behind fragile white skeletons vulnerable to starvation.',
    totalBlanks: 10,
  },
  {
    id: 'cw-10',
    title: 'Endogenous Circadian Rhythms in Plants',
    level: 'upper-intermediate',
    topic: 'science-tech',
    text: 'Although plants lack a central nervous system, they possess internal biological clocks that synchronize metabolism with the solar cycle. These endog[enous] circadian rhy[thms] allow lea[ves] to antic[ipate] dawn b[y] activating photosy[nthetic] enzymes sho[rtly] before mor[ning] sunlight actu[ally] strikes t[he] canopy. Accurate internal timing also regulates floral scent emission to coincide with the peak foraging hours of native insect pollinators.',
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
        q: 'According to the passage, what is the primary function of the melon?',
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
        q: 'According to the passage, all of the following are determined by toothed whales using echolocation EXCEPT:',
        options: [
          'The exact range and speed of prey',
          'The shape and internal density of prey',
          'The color and bioluminescent pigment of prey',
          'The location of objects in turbid waters where light cannot penetrate',
        ],
        answer: 2,
        why: 'The passage states that echolocation allows whales to ascertain range, speed, shape, and internal density, but never mentions color or pigment.',
      },
      {
        q: 'The word "vestigial" in the passage is closest in meaning to:',
        options: ['Vital and essential', 'Rudimentary and nonfunctional', 'Highly sensitive', 'Acoustically tuned'],
        answer: 1,
        why: '"Vestigial" describes an organ or structure that has lost its ancestral function through evolutionary divergence, functioning here as rudimentary or obsolete.',
      },
      {
        q: 'What can be inferred from the passage about how toothed whales hunt in deep, pitch-black ocean environments?',
        options: [
          'They rely on bio-sonar rather than vision to detect and track prey in darkness.',
          'They must ascend to sunlit surface waters before capturing prey.',
          'Their external ear canals open wider at extreme depths.',
          'They cease emitting acoustic clicks when water becomes turbid.',
        ],
        answer: 0,
        why: 'Because echolocation determines the exact range, speed, shape, and density of prey where ambient light cannot penetrate, whales can hunt effectively without relying on sight.',
      },
      {
        q: 'Why does the author mention "specialized acoustic fat channels within the lower jawbone"?',
        options: [
          'To explain the anatomical pathway that conducts returning sound vibrations to the inner ear',
          'To illustrate how cetaceans store metabolic energy for winter migrations',
          'To contrast the diet of sperm whales with that of baleen whales',
          'To show how the forehead melon produces nasal clicks',
        ],
        answer: 0,
        why: 'The author mentions the lower jawbone fat channels to explain how echoes are received and conducted to the middle and inner ear instead of through external ear canals.',
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
        q: 'According to the passage, why is heavy industrial decarbonization more challenging than passenger vehicle electrification?',
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
        q: 'Why does the author mention "pozzolanic binders" in the passage?',
        options: [
          'To illustrate an alternative material in the technological portfolio needed to mitigate cement emissions',
          'To demonstrate how steel blast furnaces utilize green hydrogen',
          'To argue that carbon capture is technically obsolete',
          'To criticize traditional geological sequestration projects',
        ],
        answer: 0,
        why: 'The author lists alternative pozzolanic binders as part of the multipronged technological portfolio for deep decarbonization.',
      },
      {
        q: 'What can be inferred from the passage about powering a traditional cement kiln purely with solar or wind electricity?',
        options: [
          'It would still release carbon dioxide because cement calcination emits CO2 chemically as a reaction byproduct.',
          'It would eliminate 100 percent of greenhouse gas emissions from cement manufacturing.',
          'It would prevent limestone from reaching temperatures above 500 degrees Celsius.',
          'It would automatically convert carbon dioxide into green hydrogen.',
        ],
        answer: 0,
        why: 'The passage states that chemical reactions inherent to cement calcination release CO2 as an unavoidable byproduct "independent of fuel choice."',
      },
      {
        q: 'The word "inherent" in the passage is closest in meaning to:',
        options: ['Intrinsic and built-in', 'Accidental and rare', 'Preventable and optional', 'Temporary and seasonal'],
        answer: 0,
        why: '"Inherent" means existing in something as a permanent, essential, or intrinsic characteristic.',
      },
      {
        q: 'According to the passage, all of the following are part of the technological portfolio for decarbonizing heavy industry EXCEPT:',
        options: [
          'Green hydrogen derived from water electrolysis',
          'Point-source carbon capture and geological sequestration',
          'Alternative pozzolanic binders',
          'Standard lithium-ion passenger vehicle batteries',
        ],
        answer: 3,
        why: 'The passage contrasts passenger vehicle lithium-ion electrification with the heavy industrial portfolio of green hydrogen, CCS, and pozzolanic binders.',
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
        q: 'According to the passage, what is the core premise of the flipped classroom model?',
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
        q: 'What can be inferred from the passage about students with low self-regulation in a flipped course?',
        options: [
          'They may fall further behind their more disciplined peers if they skip pre-class video lectures.',
          'They prefer dialectic inquiry over passive listening.',
          'They consistently outperform highly self-directed students on synchronous discussions.',
          'They spend more time mentoring classmates during in-person sessions.',
        ],
        answer: 0,
        why: 'The author explains that the model relies on self-regulation, and unprepared students struggle, exacerbating achievement divides.',
      },
      {
        q: 'The word "didactic" in the passage is closest in meaning to:',
        options: ['Instructional and informative', 'Entertaining and playful', 'Experimental and unproven', 'Controversial'],
        answer: 0,
        why: '"Didactic" refers to material intended to instruct, convey information, or teach a lesson.',
      },
      {
        q: 'Why does the author mention "active peer collaboration, dialectic inquiry, and direct instructor mentorship"?',
        options: [
          'To specify the interactive learning activities that replace passive lecturing during in-person class hours',
          'To list the tasks students must complete alone at home before watching videos',
          'To explain why educational researchers oppose the flipped classroom model',
          'To describe how traditional podium lectures are graded',
        ],
        answer: 0,
        why: 'The author lists these activities to explain why proponents argue that dedicating contact hours to active learning fosters higher engagement.',
      },
      {
        q: 'According to the passage, all of the following characterize the flipped classroom model EXCEPT:',
        options: [
          'Pre-recorded video lectures watched outside of class',
          'Problem-solving activities conducted during physical classroom sessions',
          'Heavy reliance on autonomous student self-regulation',
          'Elimination of all synchronous in-person class discussions',
        ],
        answer: 3,
        why: 'The passage explicitly states that synchronous discussions and active peer collaboration take place during physical classroom sessions.',
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
    context: 'Listen to a conversation between a student and a biochemistry professor.',
    speakers: {
      A: 'Marcus (Student)',
      B: 'Professor Alvarez',
    },
    speakerGenders: {
      A: 'male',
      B: 'female',
    },
    script: `Marcus: Professor Alvarez, I saw the flyer for the undergraduate research position in your biochemistry lab.
Professor Alvarez: Hello, Marcus! Did you take Biochemistry 301 last semester?
Marcus: Yes, I earned an A-minus and practiced gel electrophoresis in every lab section.
Professor Alvarez: Great, though this role also requires early-morning centrifuge runs on Tuesdays and Thursdays.
Marcus: My Tuesday and Thursday classes don't start until eleven, so morning shifts work well.
Professor Alvarez: Have you completed the Biosafety Level Two training module yet?
Marcus: Only Level One so far. Does Level Two take long?
Professor Alvarez: Just a two-hour online module—email me the certificate by Friday so we can start.`,
    questions: [
      {
        q: 'Why is Marcus able to work the early-morning laboratory shifts?',
        options: [
          'He is only enrolled in evening courses this semester.',
          'His Tuesday and Thursday lectures do not begin until eleven o’clock.',
          'His dormitory is located inside the biochemistry building.',
          'He has already finished all of his required science courses.',
        ],
        answer: 1,
        why: 'Marcus states that his Tuesday and Thursday classes do not start until eleven, so morning shifts fit his schedule well.',
      },
      {
        q: 'What must Marcus do before Friday?',
        options: [
          'Retake the Biochemistry 301 final examination.',
          'Complete an online Biosafety Level Two module and email the certificate.',
          'Order replacement centrifuge rotors from the department office.',
          'Submit two letters of recommendation from his previous instructors.',
        ],
        answer: 1,
        why: 'Professor Alvarez instructs Marcus to complete the two-hour online Biosafety Level Two module and email her the certificate by Friday.',
      },
    ],
  },
  {
    id: 'lis-2',
    title: 'Geology Field Trip Equipment Check',
    level: 'upper-intermediate',
    topic: 'science-tech',
    context: 'Listen to a conversation between a student and her earth sciences professor.',
    speakers: {
      A: 'Elena (Student)',
      B: 'Professor Vance',
    },
    speakerGenders: {
      A: 'female',
      B: 'male',
    },
    script: `Elena: Professor Vance, I'm picking up my field kit for Sunday's trip to the volcanic basin.
Professor Vance: Here's your hand lens and rock hammer, Elena. Did you bring hiking boots?
Elena: I only have running sneakers at my dorm right now.
Professor Vance: The basalt ridges around the caldera rim are sharp, so ankle-high boots are mandatory.
Elena: Oh, I didn't realize the terrain was that rocky. Where can I get boots before Sunday?
Professor Vance: The Campus Outdoor Recreation Center rents hiking gear to students for five dollars.
Elena: Perfect, I'll stop by their desk before five o'clock today.
Professor Vance: Also grab a waterproof field notebook while you're there in case it rains.`,
    questions: [
      {
        q: 'Why does the professor tell the student she cannot wear running sneakers on the field trip?',
        options: [
          'The university bus company requires leather footwear.',
          'The sharp basalt ridges around the caldera require ankle-high boots.',
          'The trail is covered in deep snow at this time of year.',
          'Sneakers are not permitted inside the geology laboratory.',
        ],
        answer: 1,
        why: 'Professor Vance explains that the basalt ridges around the caldera rim are sharp, making ankle-high hiking boots mandatory.',
      },
      {
        q: 'What does the professor suggest the student get from the Campus Outdoor Recreation Center?',
        options: [
          'A rock hammer and a magnifying hand lens.',
          'A topographic map of the volcanic basin.',
          'Rental hiking boots and a waterproof field notebook.',
          'A camping tent and a sleeping bag.',
        ],
        answer: 2,
        why: 'Professor Vance tells Elena she can rent hiking boots at the Campus Outdoor Recreation Center and advises her to grab a waterproof field notebook there as well.',
      },
    ],
  },
  {
    id: 'lis-3',
    title: 'Academic Advising: Course Prerequisite Waiver',
    level: 'intermediate',
    topic: 'campus-life',
    context: 'Listen to a conversation between a student and an academic advisor.',
    speakers: {
      A: 'Chloe (Student)',
      B: 'Dr. Campbell (Advisor)',
    },
    speakerGenders: {
      A: 'female',
      B: 'male',
    },
    script: `Chloe: Dr. Campbell, the portal blocked me from enrolling in Molecular Genetics 410.
Dr. Campbell: That's because Organic Chemistry Lab Two is listed as a mandatory prerequisite, Chloe.
Chloe: Right, the course requires experience with column chromatography techniques.
Dr. Campbell: Have you done chromatography outside of our regular undergraduate labs?
Chloe: Yes, I ran chromatography daily during my summer internship at the Biotechnology Institute.
Dr. Campbell: Did your research supervisor write an official verification letter?
Chloe: I brought the signed letter right here in my folder.
Dr. Campbell: Wonderful—ask Professor Martinez to sign this waiver form during her afternoon office hours.`,
    questions: [
      {
        q: 'How does Chloe show that she is prepared for Molecular Genetics 410?',
        options: [
          'She passed a departmental placement exam last week.',
          'She provides a verification letter from her biotechnology summer internship.',
          'She completed an online organic chemistry course at another college.',
          'She worked as a teaching assistant for Dr. Campbell last semester.',
        ],
        answer: 1,
        why: 'Chloe explains that she performed chromatography daily during her summer internship and brings a signed verification letter from her supervisor.',
      },
      {
        q: 'What will Chloe most likely do this afternoon?',
        options: [
          'Register for Organic Chemistry Lab Two instead.',
          'Visit the Biotechnology Institute to request a transcript.',
          'Have Professor Martinez sign a prerequisite waiver form during office hours.',
          'Submit a tuition payment at the bursar’s office.',
        ],
        answer: 2,
        why: 'Dr. Campbell instructs Chloe to take the waiver form to Professor Martinez during her afternoon office hours for a signature.',
      },
    ],
  },
];

export const CURATED_LISTEN_REPEAT: ListenRepeatTask[] = [
  {
    id: 'lr-1',
    title: 'Biology Laboratory Safety Orientation',
    level: 'intermediate',
    topic: 'campus-life',
    speakerName: 'Sarah (Lab Coordinator)',
    speakerGender: 'female',
    sentences: [
      'Welcome to the undergraduate biology laboratory.',
      'Please store your backpacks inside the hallway lockers.',
      'Safety goggles and lab coats are required at all times.',
      'You will find clean glass slides inside the top cabinet drawer.',
      'Make sure to calibrate your microscope carefully before examining the tissue samples.',
      'Dispose of all used pipettes and gloves in the labeled biohazard container near the sink.',
      'If any chemical spill occurs during the experiment, notify your laboratory supervisor immediately for assistance.',
    ],
  },
  {
    id: 'lr-2',
    title: 'University Library Research Tour',
    level: 'upper-intermediate',
    topic: 'campus-life',
    speakerName: 'Marcus (Head Librarian)',
    speakerGender: 'male',
    sentences: [
      'Welcome to the main university library.',
      'Our reference desk is located on this floor.',
      'You can borrow up to ten books with your card.',
      'Quiet individual study carrels are available on the third and fourth floors.',
      'Group collaboration rooms must be reserved online at least one day in advance.',
      'Our digital archive provides instant access to thousands of peer-reviewed academic journals and historical newspapers.',
      'If you need help locating rare primary sources, please schedule a consultation with a research librarian.',
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
        prepTimeSeconds: 0,
        responseTimeSeconds: 45,
        suggestedPoints: [
          'State clear preference (solitary vs group study)',
          'Provide specific reasons (concentration, diverse viewpoints, accountability)',
          'Give a concrete personal example from your academic experience',
        ],
        sampleAnswer: 'Personally, I definitely prefer studying alone in a quiet space like the upper floors of the university library. When I study by myself, I can concentrate deeply on complex lecture concepts without external distractions and work through problem sets at my own pace. For example, during midterms last semester, reviewing my economics notes in complete silence allowed me to master difficult quantitative formulas much faster than trying to coordinate discussion times with a large study group.',
      },
      {
        question: 'How do you prioritize your time when you have multiple academic deadlines approaching in the same week?',
        prepTimeSeconds: 0,
        responseTimeSeconds: 45,
        suggestedPoints: [
          'Mention organizational strategies (digital calendars, priority matrices, breaking down tasks)',
          'Discuss how you manage stress and maintain consistency',
          'Explain the outcome of applying this strategy',
        ],
        sampleAnswer: 'When facing multiple overlapping deadlines in the same week, I prioritize by creating a structured digital schedule and tackling assignments that carry the heaviest academic weight first. For example, last term I had a research paper and a biology midterm due on the same Friday. I broke the essay into daily writing milestones and studied for the exam in the evenings, which kept me consistent, preserved my energy, and eliminated last-minute stress.',
      },
      {
        question: 'Some universities are replacing traditional paper textbooks entirely with digital e-books. Do you think this is a beneficial policy?',
        prepTimeSeconds: 0,
        responseTimeSeconds: 45,
        suggestedPoints: [
          'Evaluate pros (cost reduction, searchability, environmental impact) and cons (screen fatigue, distraction)',
          'Take a balanced stance and offer a reasoned conclusion',
          'Highlight impact on student equity',
        ],
        sampleAnswer: 'In my view, transitioning to digital e-books is a very beneficial policy for university students. Digital textbooks significantly reduce semester textbook expenses and allow students to search for specific terms across hundreds of pages instantaneously. Furthermore, carrying one lightweight laptop is far more convenient than lugging several heavy physical books across campus every day. Although screen fatigue can occasionally occur, the financial savings and accessibility make digital textbooks a far better choice.',
      },
      {
        question: 'If you could introduce one new facility or service on your university campus to improve student well-being, what would it be and why?',
        prepTimeSeconds: 0,
        responseTimeSeconds: 45,
        suggestedPoints: [
          'Propose a specific facility (wellness/meditation center, 24/7 maker space, peer tutoring hub)',
          'Justify its necessity with current campus challenges',
          'Detail the long-term benefits to the university community',
        ],
        sampleAnswer: 'If I could introduce one new facility on campus to support student well-being, I would establish a dedicated 24-hour quiet wellness and relaxation lounge. University coursework often induces immense psychological stress, especially during final examinations, and currently students have very few quiet spaces specifically reserved for unwinding. Providing restorative rest spaces, guided meditation workshops, and complimentary herbal tea would give students a peaceful retreat between rigorous seminars, substantially enhancing mental well-being and academic productivity.',
      },
    ],
  },
];

export const CURATED_BUILD_SENTENCES: BuildSentenceTask[] = [
  {
    id: 'bs-1',
    title: 'Campus & Academic Sentence Building',
    level: 'upper-intermediate',
    topic: 'science-tech',
    items: [
      {
        id: 'bs-1-1',
        context: 'What did you think of the guided tour of the historical district?',
        framePrefix: 'The',
        frameSuffix: 'fantastic.',
        targetChunks: ['tour guides', 'who', 'showed us around', 'the', 'old', 'city', 'were'],
        distractorChunks: ['was'],
        words: ['old', 'were', 'who', 'was', 'tour guides', 'city', 'the', 'showed us around'],
        scrambledWords: ['old', 'were', 'who', 'was', 'tour guides', 'city', 'the', 'showed us around'],
        targetSentence: 'The tour guides who showed us around the old city were fantastic.',
        answer: 'The tour guides who showed us around the old city were fantastic.',
        correctSentence: 'The tour guides who showed us around the old city were fantastic.',
        grammarRule: 'Subject relative clause ("who showed us around the old city") modifying the plural noun "tour guides", which requires the plural verb "were" rather than "was".',
        explanation: 'Subject relative clause ("who showed us around the old city") modifying the plural noun "tour guides", which requires the plural verb "were" rather than "was".',
      },
      {
        id: 'bs-1-2',
        context: 'Why was the student art exhibition moved to the main auditorium?',
        framePrefix: '',
        frameSuffix: 'by the facilities office?',
        targetChunks: ["wasn't", 'the', 'gallery reservation', 'canceled', 'earlier', 'this week'],
        distractorChunks: ["weren't"],
        words: ['earlier', 'canceled', "weren't", 'gallery reservation', 'this week', 'the', "wasn't"],
        scrambledWords: ['earlier', 'canceled', "weren't", 'gallery reservation', 'this week', 'the', "wasn't"],
        targetSentence: "Wasn't the gallery reservation canceled earlier this week by the facilities office?",
        answer: "Wasn't the gallery reservation canceled earlier this week by the facilities office?",
        correctSentence: "Wasn't the gallery reservation canceled earlier this week by the facilities office?",
        grammarRule: 'Negative passive interrogative: singular subject "the gallery reservation" takes the auxiliary "wasn\'t" (not "weren\'t") + past participle "canceled".',
        explanation: 'Negative passive interrogative: singular subject "the gallery reservation" takes the auxiliary "wasn\'t" (not "weren\'t") + past participle "canceled".',
      },
      {
        id: 'bs-1-3',
        context: 'Has Professor Miller posted the revised laboratory schedule yet?',
        framePrefix: "I'm not sure",
        frameSuffix: 'to the course portal.',
        targetChunks: ['whether', 'the', 'new schedule', 'has', 'been', 'uploaded'],
        distractorChunks: ['have'],
        words: ['uploaded', 'whether', 'have', 'the', 'new schedule', 'been', 'has'],
        scrambledWords: ['uploaded', 'whether', 'have', 'the', 'new schedule', 'been', 'has'],
        targetSentence: "I'm not sure whether the new schedule has been uploaded to the course portal.",
        answer: "I'm not sure whether the new schedule has been uploaded to the course portal.",
        correctSentence: "I'm not sure whether the new schedule has been uploaded to the course portal.",
        grammarRule: 'Embedded indirect question: "whether" is followed by statement word order ("the new schedule has been uploaded") with singular auxiliary "has".',
        explanation: 'Embedded indirect question: "whether" is followed by statement word order ("the new schedule has been uploaded") with singular auxiliary "has".',
      },
      {
        id: 'bs-1-4',
        context: 'I tried studying in the science library last night, but the doors were locked at eight.',
        framePrefix: '',
        frameSuffix: 'so early on weeknights?',
        targetChunks: ['how', 'long', 'has', 'the', 'science library', 'been', 'closing'],
        distractorChunks: ['have'],
        words: ['closing', 'science library', 'how', 'have', 'long', 'been', 'has', 'the'],
        scrambledWords: ['closing', 'science library', 'how', 'have', 'long', 'been', 'has', 'the'],
        targetSentence: 'How long has the science library been closing so early on weeknights?',
        answer: 'How long has the science library been closing so early on weeknights?',
        correctSentence: 'How long has the science library been closing so early on weeknights?',
        grammarRule: 'Direct wh-interrogative in present perfect continuous: "How + long + has + the + science library + been + closing + modifiers?".',
        explanation: 'Direct wh-interrogative in present perfect continuous: "How + long + has + the + science library + been + closing + modifiers?".',
      },
      {
        id: 'bs-1-5',
        context: 'Can undergraduates use the electron microscope without a lab supervisor present?',
        framePrefix: '',
        frameSuffix: '.',
        targetChunks: ['nobody', 'is', 'permitted', 'to operate', 'the', 'microscope', 'without training'],
        distractorChunks: [],
        words: ['microscope', 'the', 'nobody', 'without training', 'to operate', 'is', 'permitted'],
        scrambledWords: ['microscope', 'the', 'nobody', 'without training', 'to operate', 'is', 'permitted'],
        targetSentence: 'Nobody is permitted to operate the microscope without training.',
        answer: 'Nobody is permitted to operate the microscope without training.',
        correctSentence: 'Nobody is permitted to operate the microscope without training.',
        grammarRule: 'Passive permission ("Nobody is permitted to operate") where singular indefinite pronoun "nobody" takes singular verb "is".',
        explanation: 'Passive permission ("Nobody is permitted to operate") where singular indefinite pronoun "nobody" takes singular verb "is".',
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
