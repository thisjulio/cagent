import { symbols } from "../theme/symbols";
import { Text } from "./Text";

export function SelectableList({
  items,
  selectedIndex,
}: {
  items: string[];
  selectedIndex: number;
}) {
  return (
    <>
      {items.map((item, index) => (
        <Text
          key={`${index}-${item}`}
          tone={index === selectedIndex ? "primary" : "secondary"}
          bold={index === selectedIndex}
        >
          {index === selectedIndex ? `${symbols.selected} ` : "  "}
          {item}
        </Text>
      ))}
    </>
  );
}
