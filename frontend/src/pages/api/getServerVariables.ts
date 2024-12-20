import { NextApiRequest, NextApiResponse } from "next";

const HTTP_STATUS_CODES = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_SERVER_ERROR: 500,
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case "POST":
      //const data = req.body;
      const protocol = req.headers["x-forwarded-proto"] || "http";
      const host = req.headers["host"]?.split(":")[0] || "localhost";
      const PORT_BACKEND = process.env.PORT_BACKEND || 3001;

      let IMPORT_TOOL_END_POINT = process.env.IMPORT_TOOL_END_POINT;
      if (!IMPORT_TOOL_END_POINT) {
        IMPORT_TOOL_END_POINT = `${protocol}://${host}:${PORT_BACKEND}`;
      }
      const IMPORT_TOOL_FROM_DOCKER =
        process.env.IMPORT_TOOL_FROM_DOCKER || "N";

      const retData = {
        IMPORT_TOOL_END_POINT: IMPORT_TOOL_END_POINT,
        IMPORT_TOOL_ENCRYPTION_KEY: process.env.IMPORT_TOOL_ENCRYPTION_KEY,
        IMPORT_TOOL_FROM_DOCKER: IMPORT_TOOL_FROM_DOCKER,
      };
      res.status(HTTP_STATUS_CODES.OK).json(retData);
      break;

    default:
      res.setHeader("Allow", ["POST"]);
      res
        .status(HTTP_STATUS_CODES.METHOD_NOT_ALLOWED)
        .end(`Method ${method} Not Allowed`);
  }
}
