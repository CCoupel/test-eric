import { useNavigate } from 'react-router-dom';
import { activitiesApi } from '../api/activities';
import { ActivityForm } from '../components/ActivityForm';

export function ActivityNewPage() {
  const navigate = useNavigate();
  return (
    <section className="screen narrow">
      <h1>Nouvelle activité</h1>
      <ActivityForm
        submitLabel="Enregistrer (brouillon)"
        onSubmit={async (input) => {
          const a = await activitiesApi.create(input);
          navigate(`/activities/${a.id}`);
        }}
        onCancel={() => navigate('/activities')}
      />
      <p className="hint">Une activité créée est en brouillon : elle n’est pas visible par les participants tant qu’elle n’est pas ouverte.</p>
    </section>
  );
}
