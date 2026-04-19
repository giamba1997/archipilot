import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { CollabModal } from "./CollabModal";

export function CollabModalWrapper({ project, onClose, showToast, profile, onUpgrade }) {
  const [ownerId, setOwnerId] = useState(project._ownerId || null);
  useEffect(() => {
    if (!ownerId) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) setOwnerId(user.id);
      });
    }
  }, [ownerId]);
  if (!ownerId) return null;
  return <CollabModal project={project} ownerId={ownerId} onClose={onClose} showToast={showToast} profile={profile} onUpgrade={onUpgrade} />;
}
