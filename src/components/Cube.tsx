import Image from "next/image";

/** The Tesseract cube icon (cropped from the dark logo). */
export function Cube({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/tesseract-cube-96.png"
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-[22%] ${className}`}
      unoptimized
    />
  );
}
