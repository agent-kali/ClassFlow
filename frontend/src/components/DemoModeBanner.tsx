import React from 'react';
import PageContainer, { type PageSize } from './PageContainer';

type DemoModeBannerProps = {
  containerSize?: PageSize;
};

const isDemoMode =
  typeof import.meta !== 'undefined' &&
  (import.meta as any).env?.VITE_DEMO_MODE === 'true';

const DemoModeBanner: React.FC<DemoModeBannerProps> = ({ containerSize = 'xl' }) => {
  if (!isDemoMode) return null;

  return (
    <PageContainer size={containerSize} className="pt-3">
      <div className="flex h-9 items-center gap-2 border-l-[3px] border-amber-500 bg-amber-500/[0.05] px-3 text-[13px] text-white/65">
        <span className="text-sm leading-none text-amber-400" aria-hidden="true">
          ⚠
        </span>
        <span>
          Demo mode — this data is shared and resets periodically. Changes may be visible to other demo users.
        </span>
      </div>
    </PageContainer>
  );
};

export default DemoModeBanner;
