let lastUserAiRequestTime = 0;

export const markUserAiRequest = (): void => {
  lastUserAiRequestTime = Date.now();
};

export const getLastUserAiRequestTime = (): number => {
  return lastUserAiRequestTime;
};
