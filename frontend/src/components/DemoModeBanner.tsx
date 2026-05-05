import React from 'react';
import { InformationCircleIcon } from '@heroicons/react/20/solid';
import PageContainer, { type PageSize } from './PageContainer';

type DemoModeBannerProps = {
  containerSize?: PageSize;
};

const isDemoMode =
  typeof import.meta !== 'undefined' &&
  (import.meta as any).env?.VITE_DEMO_MODE === 'true';

const demoResetInterval =
  typeof import.meta !== 'undefined'
    ? ((import.meta as any).env?.VITE_DEMO_RESET_INTERVAL as string | undefined)?.trim()
    : undefined;

const resetText =
  demoResetInterval && demoResetInterval.toLowerCase() !== 'periodically'
    ? `resets every ${demoResetInterval}`
    : 'resets periodically';

const DemoModeBanner: React.FC<DemoModeBannerProps> = ({ containerSize = 'xl' }) => {
  if (!isDemoMode) return null;

  return (
    <PageContainer size={containerSize}>
      <div className="flex min-h-10 items-center gap-2 border-l-4 border-warm-400/70 bg-surface px-3 py-2 text-[13px] leading-snug text-white/70 shadow-glass">
        <InformationCircleIcon
          className="h-4 w-4 flex-none text-warm-400"
          aria-hidden="true"
        />
        <span>
          Demo mode — this dataset is shared with all demo users and {resetText}. Your changes may be visible to others.
        </span>
      </div>
    </PageContainer>
  );
};

export default DemoModeBanner;
