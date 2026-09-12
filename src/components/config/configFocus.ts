import { createContext } from 'react';

// Repeated searches for the same field must reopen its manually collapsed section.
export const ConfigFocusContext = createContext(0);
