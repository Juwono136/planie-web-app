import { z } from "zod";

export const loginSchema = z.object({
  email: z.email({ message: "Please enter a valid email address" }),
  password: z.string().min(1, "Required"),
});

export const registerSchema = z.object({
  name: z.string().min(1, "Name is Required"),
  email: z.email({ message: "Please enter a valid email address" }),
  password: z.string().min(8, "Minimum of 8 characters required"),
});
