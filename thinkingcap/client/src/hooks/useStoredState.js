import { useEffect, useState } from 'react';
import { readStored, writeStored } from '../storage.js';

// Normalization runs only during initialization; storage writes do not run on
// unrelated renders such as typing a draft or toggling a panel.
export default function useStoredState(key, normalize) {
  const [value, setValue] = useState(() => readStored(key, normalize));
  useEffect(() => { writeStored(key, value); }, [key, value]);
  return [value, setValue];
}
