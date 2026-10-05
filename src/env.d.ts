/// <reference types="vite/client" />

declare module 'virtual:icons' {
  const icons: Record<string, string>;
  export default icons;
}

declare module 'virtual:art' {
  const art: { enemies: string[]; bg: string[] };
  export default art;
}
