import React from 'react';

type PageSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface PageContainerProps {
  size?: PageSize;
  className?: string;
  children: React.ReactNode;
}

const PageContainer: React.FC<PageContainerProps> = ({
  size = 'lg',
  className = '',
  children,
}) => (
  <div className={`page-container page-container-${size} ${className}`}>
    {children}
  </div>
);

export default PageContainer;
