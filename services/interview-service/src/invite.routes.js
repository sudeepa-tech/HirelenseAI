import express from "express";
import {
  completeInviteHandler,
  createInviteHandler,
  finishInviteHandler,
  getInviteByTokenHandler,
  listInvitesHandler,
  saveProgressHandler,
  startInviteHandler,
  timeoutInviteHandler
} from "./invite.controller.js";

const router = express.Router();

router.get("/invite", listInvitesHandler);
router.post("/invite", createInviteHandler);
router.get("/invite/:token", getInviteByTokenHandler);
router.post("/invite/:token/start", startInviteHandler);
router.post("/invite/:token/progress", saveProgressHandler);
router.post("/invite/:token/finish", finishInviteHandler);

router.get("/interviews/invite", listInvitesHandler);
router.post("/interviews/invite", createInviteHandler);
router.get("/interviews/invite/:token", getInviteByTokenHandler);
router.post("/interviews/invite/:token/start", startInviteHandler);
router.post("/interviews/invite/:token/progress", saveProgressHandler);
router.post("/interviews/invite/:token/finish", finishInviteHandler);

router.get("/invites", listInvitesHandler);
router.post("/invites", createInviteHandler);
router.get("/invites/:token", getInviteByTokenHandler);
router.post("/invites/:token/start", startInviteHandler);
router.post("/invites/:token/progress", saveProgressHandler);
router.post("/invites/:token/finish", finishInviteHandler);
router.post("/invites/:token/complete", completeInviteHandler);
router.post("/invites/:token/timeout", timeoutInviteHandler);

export default router;
