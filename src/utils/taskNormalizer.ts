/**
 * Normalizes legacy or Firestore question objects so they conform to 2026 ETS standards.
 * Maps legacy field names: type/section/taskId -> taskType, level/proficiencyLevel -> level, topic/academicTopic -> topic.
 */
export function normalizeTaskData(raw: any): { taskType: string; level: string; topic: string; content: any } | null {
  if (!raw || typeof raw !== 'object') return null;

  const taskType = String(
    raw.taskType || raw.type || raw.section || raw.taskId || raw.category || 'academic-discussion'
  ).toLowerCase().trim();

  const level = String(
    raw.level || raw.proficiencyLevel || raw.difficulty || 'intermediate'
  ).toLowerCase().trim();

  const topic = String(
    raw.topic || raw.academicTopic || raw.subject || 'general'
  ).toLowerCase().trim();

  const content = raw.content && typeof raw.content === 'object' ? raw.content : raw;

  return {
    taskType,
    level,
    topic,
    content: {
      ...content,
      id: content.id || raw.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      level: content.level || level,
      topic: content.topic || topic,
    },
  };
}
