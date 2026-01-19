from django.db import migrations, models
from django.db.models import Q
from django.db.models.functions import Lower


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0003_user_pseudo"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                Lower("pseudo"),
                name="uniq_user_pseudo_ci",
                condition=~Q(pseudo=""),
            ),
        ),
    ]
