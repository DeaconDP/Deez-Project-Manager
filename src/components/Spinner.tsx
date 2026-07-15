interface Props {
  size?: "sm" | "md";
  className?: string;
}

export function Spinner({ size = "md", className }: Props) {
  return (
    <span
      className={`spinner spinner-${size}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    />
  );
}
