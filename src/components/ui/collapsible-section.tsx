"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
    title: React.ReactNode
    icon?: React.ReactNode
    defaultOpen?: boolean
    children: React.ReactNode
    className?: string
}

export function CollapsibleSection({
    title,
    icon,
    defaultOpen = true,
    children,
    className,
}: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = React.useState(defaultOpen)

    return (
        <div className={cn("border rounded-lg bg-card shadow-sm", className)}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
            >
                <div className="flex items-center gap-2 font-semibold text-lg">
                    {icon}
                    {title}
                </div>
                <ChevronDown
                    className={cn(
                        "h-5 w-5 text-muted-foreground transition-transform duration-200",
                        isOpen ? "rotate-180" : ""
                    )}
                />
            </button>
            {isOpen && (
                <div className="p-4 pt-0 border-t animate-in fade-in-0 slide-in-from-top-1 duration-200">
                    {children}
                </div>
            )}
        </div>
    )
}
