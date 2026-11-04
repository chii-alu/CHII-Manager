import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Buttons: primary (navy), secondary (outlined), ghost (text). Visible focus ring and reduced-motion safe.
export const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F93E0] disabled:opacity-50 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        primary: "bg-[#14306B] text-white hover:bg-[#0B2145]",
        secondary: "border border-[#C9D3E3] bg-white text-[#14306B] hover:border-[#14306B]",
        ghost: "text-[#14306B] hover:bg-[#EEF3FB]",
      },
      size: {
        sm: "px-3 py-1.5 text-sm",
        md: "px-4 py-2 text-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles> & { children: ReactNode };

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button type="button" className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

export function ButtonLink({ href, variant, size, className, children }: VariantProps<typeof buttonStyles> & { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn(buttonStyles({ variant, size }), className)}>
      {children}
    </Link>
  );
}
