import React from 'react';
import { cn } from './Button';
import { motion } from 'framer-motion';

export const Card = ({ className, children, ...props }) => {
    return (
        <div className={cn("glass-panel p-6", className)} {...props}>
            {children}
        </div>
    );
};

export const AnimatedCard = ({ className, children, delay = 0, ...props }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] }}
            className={cn("glass-panel p-6", className)}
            {...props}
        >
            {children}
        </motion.div>
    );
};
