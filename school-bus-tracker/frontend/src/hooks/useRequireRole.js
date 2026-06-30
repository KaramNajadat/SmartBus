import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function useRequireRole(expectedRole) {
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        navigate('/login', { replace: true });
        return;
      }

      try {
        const docRef = doc(db, 'roles', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const roleData = docSnap.data();
          
          if (roleData.role !== expectedRole) {
            navigate('/unauthorized', { replace: true });
          } else {
            setUserRole(roleData);
          }
        } else {
          // If no role document exists, deny access
          navigate('/unauthorized', { replace: true });
        }
      } catch (error) {
        console.error("Error fetching role:", error);
        navigate('/unauthorized', { replace: true });
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [expectedRole, navigate]);

  return { userRole, loading };
}
