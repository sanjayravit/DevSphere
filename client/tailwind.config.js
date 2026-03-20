/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                dark: {
                    900: '#0B0B0E',
                    800: '#121216',
                    700: '#1A1A20',
                },
                primary: {
                    500: '#6366F1', // Indigo
                    400: '#818CF8', // Light Indigo
                },
                accent: {
                    blue: '#38BDF8',
                    purple: '#A855F7',
                    cyan: '#22D3EE',
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                display: ['Poppins', 'sans-serif'],
                mono: ['JetBrains Mono', 'Menlo', 'monospace'],
            },
            backgroundImage: {
                'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
                'glass-gradient': 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
            },
            boxShadow: {
                'glass': '0 4px 30px rgba(0, 0, 0, 0.1)',
                'neon-blue': '0 0 15px rgba(56, 189, 248, 0.5)',
                'neon-purple': '0 0 15px rgba(168, 85, 247, 0.5)',
            },
            backdropBlur: {
                'xs': '2px',
            }
        },
    },
    plugins: [],
}
