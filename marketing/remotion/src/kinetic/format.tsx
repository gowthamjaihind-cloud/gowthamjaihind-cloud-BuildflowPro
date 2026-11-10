import React, { createContext, useContext } from "react";
import { WIDE, type Format } from "../../../kinetic-format";

/**
 * Which shape this render is. Wide unless a composition says otherwise, so the
 * landing-page hero is unchanged by the tall cut existing.
 */
const FormatContext = createContext<Format>(WIDE);

export const FormatProvider: React.FC<{ format: Format; children: React.ReactNode }> = ({ format, children }) => (
  <FormatContext.Provider value={format}>{children}</FormatContext.Provider>
);

export const useFormat = () => useContext(FormatContext);
