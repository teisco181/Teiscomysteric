import React, { useState } from 'react';
import { User } from 'lucide-react';

interface PersonAvatarProps {
  src: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const PersonAvatar: React.FC<PersonAvatarProps> = ({
  src,
  name,
  size = 'md',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  const dims =
    size === 'sm'
      ? 'w-10 h-10 text-xs'
      : size === 'lg'
      ? 'w-24 h-24 text-lg'
      : 'w-14 h-14 text-sm';

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  if (!src || failed) {
    return (
      <div
        className={`${dims} rounded-lg border border-slate-300 dark:border-slate-700 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center font-mono font-semibold text-slate-600 dark:text-slate-300 shrink-0 ${className}`}
        aria-label={name}
      >
        {initials || <User className="w-5 h-5" />}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Archieffoto van ${name}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${dims} rounded-lg object-cover border border-slate-300 dark:border-slate-700 shrink-0 bg-slate-900 ${className}`}
    />
  );
};
