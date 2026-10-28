import React from 'react';
import { RubricsModal, RubricsModalProps } from './RubricsModal';

export const RubricGuideModal: React.FC<RubricsModalProps> = (props) => {
  return <RubricsModal {...props} />;
};

export { RubricsModal };
export default RubricGuideModal;
