import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F5F7',
  card: '#FFFFFF',
  text: '#15171A',
  muted: '#61656D',
  border: '#DADDE2',
  primary: '#1F7A4D',
  primaryText: '#FFFFFF',
  danger: '#C62828',
  warn: '#B26A00',
  done: '#E7F3EC',
  input: '#FFFFFF',
  header: '#14213D',
  headerText: '#FFFFFF',
};

const dark: typeof light = {
  bg: '#0E0F11',
  card: '#1A1C20',
  text: '#F1F2F4',
  muted: '#A0A4AB',
  border: '#2E3138',
  primary: '#3DBE7E',
  primaryText: '#0B1A12',
  danger: '#FF6B6B',
  warn: '#FFB74D',
  done: '#16261D',
  input: '#22252A',
  header: '#16181C',
  headerText: '#F1F2F4',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Tailles « une main en magasin ». */
export const sizes = {
  touch: 56,
  radius: 14,
  font: 18,
  fontLarge: 22,
  pad: 16,
};
