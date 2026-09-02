import * as React from "react";

/** Minimal Slot: merges props onto its single element child, ignoring falsy siblings. */
export const Slot = React.forwardRef<HTMLElement, { children?: React.ReactNode } & Record<string, unknown>>(
  ({ children, ...props }, ref) => {
    const child = React.Children.toArray(children as React.ReactNode).find((c) => React.isValidElement(c)) as
      | React.ReactElement<Record<string, unknown>>
      | undefined;
    if (!child) return null;

    const childProps = child.props;
    return React.cloneElement(child, {
      ...props,
      ...childProps,
      className: [props.className, childProps.className].filter(Boolean).join(" ") || undefined,
      ref,
    });
  },
);
Slot.displayName = "Slot";
