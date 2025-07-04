import React from 'react';
import type { Command, LocalJSXCommand } from '../types/command'; // Updated import path
import { Doctor } from '../screens/Doctor'; // Assuming .js extension is needed
import { PRODUCT_NAME } from '../constants/product'; // Assuming .js extension is needed

const doctorCommand: LocalJSXCommand = {
  name: 'doctor',
  description: `Checks the health of your ${PRODUCT_NAME} installation`,
  options: [], // No options for this command
  isEnabled: true,
  isHidden: false,
  userFacingName() {
    return 'doctor';
  },
  type: 'local-jsx',
  async handler(args, onDone, context) { // Renamed call to handler, args and context are unused
    const element = React.createElement(Doctor, {
      onDone,
      doctorMode: true,
    });
    return Promise.resolve(element);
  },
};

export default doctorCommand;
