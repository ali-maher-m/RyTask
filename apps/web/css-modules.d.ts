declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css';

/** The shared global stylesheet exposed by @rytask/ui (tokens + base); imported for side effects. */
declare module '@rytask/ui/styles';
