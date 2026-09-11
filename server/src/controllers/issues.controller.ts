import { Request, Response } from "express";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../services/access.service.js";
import * as issues from "../services/issues.service.js";

const ids = (request: Request) =>
  [String(request.params.orgId), String(request.params.campId)] as const;
const fail = (response: Response, error: unknown) => {
  if (error instanceof ForbiddenError)
    return response.status(403).json({ message: error.message });
  if (error instanceof NotFoundError)
    return response.status(404).json({ message: error.message });
  if (error instanceof ValidationError)
    return response.status(400).json({ message: error.message });
  console.error(error);
  return response
    .status(500)
    .json({ message: "No pudimos completar la operación." });
};
export const list = async (request: Request, response: Response) => {
  try {
    response.json(await issues.listIssueTypes(request.user!, ...ids(request)));
  } catch (error) {
    fail(response, error);
  }
};
export const create = async (request: Request, response: Response) => {
  try {
    response
      .status(201)
      .json(
        await issues.createIssueType(
          request.user!,
          ...ids(request),
          request.body?.name,
        ),
      );
  } catch (error) {
    fail(response, error);
  }
};
export const update = async (request: Request, response: Response) => {
  try {
    response.json(
      await issues.updateIssueType(
        request.user!,
        ...ids(request),
        String(request.params.issueId),
        request.body?.name,
      ),
    );
  } catch (error) {
    fail(response, error);
  }
};
export const remove = async (request: Request, response: Response) => {
  try {
    await issues.deleteIssueType(
      request.user!,
      ...ids(request),
      String(request.params.issueId),
    );
    response.status(204).end();
  } catch (error) {
    fail(response, error);
  }
};
export const summary = async (request: Request, response: Response) => {
  try {
    response.json(
      await issues.issueSummary(
        request.user!,
        ...ids(request),
        typeof request.query.start === "string"
          ? request.query.start
          : undefined,
        typeof request.query.end === "string" ? request.query.end : undefined,
      ),
    );
  } catch (error) {
    fail(response, error);
  }
};
