import React from 'react';
import { cn } from './Button';

export const Input = React.forwardRef(({ className, type, icon: Icon, error, ...props }, ref) => {
    return (
        <div className="relative w-full">
            {Icon && (
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-400">
                    <Icon size={18} />
                </div>
            )}
            <input
                type={type}
                className={cn(
                    "flex h-12 w-full rounded-xl border border-white/10 bg-dark-800/50 px-4 py-2 text-sm text-white placeholder:text-gray-500",
                    "focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    Icon && "pl-11",
                    error && "border-red-500 focus:ring-red-500/50 focus:border-red-500",
                    className
                )}
                ref={ref}
                {...props}
            />
            {error && (
                <p className="mt-1 text-sm text-red-500">{error}</p>
            )}
        </div>
    );
});

Input.displayName = "Input";
