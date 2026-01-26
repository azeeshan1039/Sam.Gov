'use client';

import { FileText, Loader2 } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from 'react';

export default function Loading() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Simulate loading progress
    // Note: This is a simulation and doesn't reflect actual page load percentage.
    // A true percentage based on load time is complex to implement accurately.
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) {
          clearInterval(interval); // Stop near the end to avoid jumping to 100 immediately
          return 95;
        }
        // Increment progress, slowing down towards the end
        const diff = Math.random() * 10;
        return Math.min(prev + diff, 95);
      });
    }, 150); // Adjust interval timing for desired speed

    // Cleanup interval on component unmount
    return () => clearInterval(interval);
  }, []);

  // Simulate completion after a delay - replace with actual load completion logic if available
  useEffect(() => {
     // This effect is mainly for demo; in a real app, the loading state
     // is managed by Next.js router events or data fetching states.
     // We don't manually set to 100 here as loading.tsx automatically hides
     // when the actual page content is ready.
     // If you needed to ensure it hits 100 visually before disappearing,
     // you'd need more complex state management outside loading.tsx.
  }, []);


  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center space-y-4">
         {/* Simple animated icon */}
         <div className="relative h-16 w-16">
           <FileText className="h-full w-full text-primary opacity-50" />
           <Loader2 className="absolute inset-0 m-auto h-8 w-8 animate-spin text-primary" />
         </div>

         {/* Progress bar simulating the icon filling */}
         {/* <div className="w-32 mt-2">
           <Progress value={progress} className="h-2 [&>div]:bg-primary" />
         </div> */}
         <p className="text-lg font-medium text-primary">Loading Content...</p>
        <p className="text-sm text-muted-foreground">Please wait</p>
      </div>
    </div>
  );
}
