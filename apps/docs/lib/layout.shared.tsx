import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image src="/logo-mark.svg" alt="" width={22} height={22} />
          <span style={{ fontFamily: 'var(--font-brand)', fontWeight: 700 }}>RyTask docs</span>
        </>
      ),
    },
    githubUrl: 'https://github.com/rytask/rytask',
  };
}
